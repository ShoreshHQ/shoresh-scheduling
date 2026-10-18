@IsTest
private class SeasonSetupControllerTest {
  private static String errorOf(Exception e) {
    return e.getMessage();
  }

  @IsTest
  static void loadsTheWholeSeasonForTheScreen() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Database.insert(
      new CampLabel__c(
        Camp__c = camp.Id,
        ModelTerm__c = 'Group',
        Singular__c = 'Bunk',
        Plural__c = 'Bunks'
      ),
      AccessLevel.SYSTEM_MODE
    );
    Season__c season = ShoreshTestData.fullSeason(camp.Id);
    User scheduler = ShoreshTestData.scheduler();
    // The camp admin shares the season with the scheduler, as a sharing rule would.
    Database.insert(
      new Season__Share(
        ParentId = season.Id,
        UserOrGroupId = scheduler.Id,
        AccessLevel = 'Edit'
      ),
      AccessLevel.SYSTEM_MODE
    );

    System.runAs(scheduler) {
      Assert.areEqual(1, SeasonSetupController.getCamps().size());
      Assert.areEqual(1, SeasonSetupController.getSeasons(camp.Id).size());
      SeasonSetupReader.SeasonSetup setup = SeasonSetupController.getSeasonSetup(
        season.Id
      );
      Assert.areEqual('Summer 2026', setup.season.Name);
      Assert.areEqual(6, setup.weeks.size());
      Assert.areEqual(
        Date.newInstance(2026, 6, 29),
        setup.weeks[0].StartDate__c
      );
      Assert.areEqual(1, setup.programs.size());
      Assert.areEqual(2, setup.programs[0].timeBlocks.size());
      Assert.areEqual(
        'Period 1',
        setup.programs[0].timeBlocks[0].Name,
        'Blocks in time order'
      );
      Assert.areEqual(1, setup.programs[0].divisions.size());
      Assert.areEqual(2, setup.programs[0].divisions[0].groups.size());
      Boolean sawBunk = false;
      for (CampLabels.TermLabel label : setup.labels) {
        sawBunk |= label.term == 'Group' && label.singular == 'Bunk';
      }
      Assert.isTrue(sawBunk);
      Assert.isFalse(SeasonSetupController.getLabels(camp.Id).isEmpty());
    }
  }

  @IsTest
  static void aSeasonNotSharedWithTheSchedulerIsNotShown() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    User scheduler = ShoreshTestData.scheduler();
    System.runAs(scheduler) {
      Assert.areEqual(0, SeasonSetupController.getSeasons(camp.Id).size());
      try {
        SeasonSetupController.getSeasonSetup(season.Id);
        Assert.fail('Not shared, not shown');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          'That season wasn\'t found. Reload the page.',
          errorOf(e)
        );
      }
    }
  }

  @IsTest
  static void schedulerSetsUpASeasonFromScratch() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    User scheduler = ShoreshTestData.scheduler();
    System.runAs(scheduler) {
      Season__c season = new Season__c(
        Name = 'Summer 2026',
        Camp__c = camp.Id,
        StartDate__c = Date.newInstance(2026, 6, 29),
        EndDate__c = Date.newInstance(2026, 8, 7)
      );
      Id seasonId = SeasonSetupController.saveRecords(
        new List<SObject>{ season }
      )[0];
      SeasonSetupController.addWeeksFromSeasonDates(seasonId);

      Program__c program = new Program__c(
        Season__c = seasonId,
        Name = 'Main',
        SortOrder__c = 1
      );
      Id programId = SeasonSetupController.saveRecords(
        new List<SObject>{ program }
      )[0];
      Id divisionId = SeasonSetupController.saveRecords(
        new List<SObject>{
          new Division__c(Program__c = programId, Name = 'Juniors')
        }
      )[0];
      SeasonSetupController.saveRecords(
        new List<SObject>{
          new Group__c(
            Division__c = divisionId,
            Name = 'Group A',
            Availability__c = 'AllDay'
          ),
          new Group__c(
            Division__c = divisionId,
            Name = 'Group B',
            Availability__c = 'AfternoonOnly'
          )
        }
      );
      SeasonSetupController.saveRecords(
        new List<SObject>{
          new TimeBlock__c(
            Program__c = programId,
            Name = 'Period 1',
            StartTime__c = Time.newInstance(9, 0, 0, 0),
            EndTime__c = Time.newInstance(9, 45, 0, 0),
            PartOfDay__c = 'Morning'
          )
        }
      );

      // Edit an existing record.
      SeasonSetupController.saveRecords(
        new List<SObject>{ new Program__c(Id = programId, Friday__c = false) }
      );

      SeasonSetupReader.SeasonSetup setup = SeasonSetupController.getSeasonSetup(
        seasonId
      );
      Assert.areEqual(6, setup.weeks.size());
      Assert.areEqual('Week 1', setup.weeks[0].Name);
      Assert.areEqual(Date.newInstance(2026, 7, 3), setup.weeks[0].EndDate__c);
      Assert.isFalse(setup.programs[0].program.Friday__c);
      Assert.areEqual(2, setup.programs[0].divisions[0].groups.size());
      Assert.areEqual(1, setup.programs[0].timeBlocks.size());
    }
  }

  @IsTest
  static void weeksFromSeasonDatesUseTheCampsWordAndOnlyFillAnEmptySeason() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Database.insert(
        new CampLabel__c(
          Camp__c = camp.Id,
          ModelTerm__c = 'Week',
          Singular__c = 'Session',
          Plural__c = 'Sessions'
        ),
        AccessLevel.SYSTEM_MODE
      );
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
      SeasonSetupController.addWeeksFromSeasonDates(season.Id);
      Assert.areEqual(
        'Session 1',
        [SELECT Name FROM Week__c WHERE SortOrder__c = 1 WITH SYSTEM_MODE].Name
      );
      try {
        SeasonSetupController.addWeeksFromSeasonDates(season.Id);
        Assert.fail('Only for an empty season');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          'This season already has Sessions. Add more one at a time.',
          errorOf(e)
        );
      }
    }
  }

  @IsTest
  static void saveErrorsComeBackAsMessagesAndSaveNothing() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
      Date monday = Date.newInstance(2026, 6, 29);
      try {
        SeasonSetupController.saveRecords(
          new List<SObject>{
            new Week__c(
              Season__c = season.Id,
              Name = 'A',
              StartDate__c = monday,
              EndDate__c = monday.addDays(4)
            ),
            new Week__c(
              Season__c = season.Id,
              Name = 'B',
              StartDate__c = monday.addDays(7),
              EndDate__c = monday
            )
          }
        );
        Assert.fail('Backwards dates are refused');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          '"B": The end date must be on or after the start date.',
          errorOf(e)
        );
      }
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Week__c WITH SYSTEM_MODE],
        'All or nothing'
      );
    }
  }

  @IsTest
  static void onlyShoreshSetupRecordsCanBeSavedOrDeleted() {
    System.runAs(ShoreshTestData.scheduler()) {
      try {
        SeasonSetupController.saveRecords(
          new List<SObject>{ new Account(Name = 'Not ours') }
        );
        Assert.fail('Other objects are refused');
      } catch (AuraHandledException e) {
        Assert.areEqual('These screens can\'t save that.', errorOf(e));
      }
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      try {
        SeasonSetupController.deleteRecord(camp.Id);
        Assert.fail('Camps are not deleted from these screens');
      } catch (AuraHandledException e) {
        Assert.areEqual('These screens can\'t delete that.', errorOf(e));
      }
    }
  }

  @IsTest
  static void deletingExplainsWhatIsInTheWay() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      // Swim is open only to Group A.
      ShoreshTestData.placesAndActivities(season.Id);
      Group__c used = [
        SELECT Id
        FROM Group__c
        WHERE Name = 'Group A'
        WITH SYSTEM_MODE
      ];
      try {
        SeasonSetupController.deleteRecord(used.Id);
        Assert.fail('A group in use is kept');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          'This can\'t be deleted yet: it is in "Who can do it" for "Swim". Change who can do that activity first, then delete it.',
          errorOf(e)
        );
      }
      Group__c unused = [
        SELECT Id
        FROM Group__c
        WHERE Name = 'Group B'
        WITH SYSTEM_MODE
      ];
      SeasonSetupController.deleteRecord(unused.Id);
      SeasonSetupController.deleteRecord(season.Id);
      Assert.areEqual(0, [SELECT COUNT() FROM Season__c WITH SYSTEM_MODE]);
    }
  }

  /** words is "singular/plural", for example "Bunk/Bunks". */
  private static void setWords(
    List<CampLabels.TermLabel> labels,
    String term,
    String words
  ) {
    for (CampLabels.TermLabel row : labels) {
      if (row.term == term) {
        row.singular = words.substringBefore('/');
        row.plural = words.substringAfter('/');
      }
    }
  }

  @IsTest
  static void campLabelsAreSavedChangedAndCleared() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      List<CampLabels.TermLabel> labels = SeasonSetupController.getLabels(
        camp.Id
      );
      setWords(labels, 'Group', ' Bunk /Bunks');
      setWords(labels, 'Division', 'Unit/Units');
      SeasonSetupController.saveCampLabels(camp.Id, labels);
      Assert.areEqual('Bunk', CampLabels.forCamp(camp.Id).singular('Group'));
      Assert.areEqual('Units', CampLabels.forCamp(camp.Id).plural('Division'));

      labels = SeasonSetupController.getLabels(camp.Id);
      setWords(labels, 'Group', 'Cabin/Cabins');
      setWords(labels, 'Division', '/');
      SeasonSetupController.saveCampLabels(camp.Id, labels);
      Assert.areEqual('Cabin', CampLabels.forCamp(camp.Id).singular('Group'));
      Assert.areEqual(
        'Division',
        CampLabels.forCamp(camp.Id).singular('Division'),
        'Cleared goes back to the model term'
      );
      Assert.areEqual(1, [SELECT COUNT() FROM CampLabel__c WITH SYSTEM_MODE]);
    }
  }

  @IsTest
  static void typingTheStandardWordsIsTheSameAsClearingThem() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      List<CampLabels.TermLabel> labels = SeasonSetupController.getLabels(
        camp.Id
      );
      setWords(labels, 'Group', 'Group/Groups');
      SeasonSetupController.saveCampLabels(camp.Id, labels);
      Assert.areEqual(0, [SELECT COUNT() FROM CampLabel__c WITH SYSTEM_MODE]);
    }
  }

  @IsTest
  static void halfALabelIsRefusedAndNothingIsSaved() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      List<CampLabels.TermLabel> labels = SeasonSetupController.getLabels(
        camp.Id
      );
      setWords(labels, 'Group', 'Bunk/Bunks');
      setWords(labels, 'Week', 'Session/');
      try {
        SeasonSetupController.saveCampLabels(camp.Id, labels);
        Assert.fail('Half a label is refused');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          'Give "Week" both a singular and a plural word, or clear both.',
          errorOf(e)
        );
      }
      Assert.areEqual(0, [SELECT COUNT() FROM CampLabel__c WITH SYSTEM_MODE]);
    }
  }

  @IsTest
  static void copyThroughTheScreen() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      SeasonCopier.Preview preview = SeasonSetupController.previewCopy(
        season.Id,
        Date.newInstance(2027, 6, 28)
      );
      Assert.areEqual(6, preview.weeks.size());
      Id copyId = SeasonSetupController.copySeason(
        season.Id,
        'Summer 2027',
        Date.newInstance(2027, 6, 28)
      );
      Assert.areEqual(
        season.Id,
        [
          SELECT CopiedFrom__c
          FROM Season__c
          WHERE Id = :copyId
          WITH SYSTEM_MODE
        ]
        .CopiedFrom__c
      );
      try {
        SeasonSetupController.copySeason(
          season.Id,
          '',
          Date.newInstance(2027, 6, 28)
        );
        Assert.fail('Needs a name');
      } catch (AuraHandledException e) {
        Assert.areEqual('Give the new season a name.', errorOf(e));
      }
      try {
        SeasonSetupController.previewCopy(season.Id, null);
        Assert.fail('Needs a date');
      } catch (AuraHandledException e) {
        Assert.areEqual('Choose a start date for the new season.', errorOf(e));
      }
    }
  }

  @IsTest
  static void anySchedulerCanChangeCampWords() {
    User creator = ShoreshTestData.scheduler();
    User other = ShoreshTestData.scheduler();
    Camp__c camp;
    System.runAs(creator) {
      camp = ShoreshTestData.camp('Camp Willow');
    }
    System.runAs(other) {
      Assert.isNull(SeasonSetupController.campWordsBlockedReason(camp.Id));
      List<CampLabels.TermLabel> labels = SeasonSetupController.getLabels(
        camp.Id
      );
      setWords(labels, 'Group', 'Bunk/Bunks');
      SeasonSetupController.saveCampLabels(camp.Id, labels);
      Assert.areEqual('Bunk', CampLabels.forCamp(camp.Id).singular('Group'));
    }
  }

  @IsTest
  static void someoneWithoutShoreshAccessCannotChangeCampWords() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    List<CampLabels.TermLabel> labels = CampLabels.forCamp(camp.Id).all();
    setWords(labels, 'Group', 'Bunk/Bunks');
    System.runAs(ShoreshTestData.outsider()) {
      String expected = 'You don\'t have access to change camp words. A Salesforce admin can give you Shoresh Scheduler access.';
      Assert.areEqual(
        expected,
        SeasonSetupController.campWordsBlockedReason(camp.Id)
      );
      try {
        SeasonSetupController.saveCampLabels(camp.Id, labels);
        Assert.fail('No Shoresh access, no changes');
      } catch (AuraHandledException e) {
        Assert.areEqual(expected, errorOf(e));
      }
    }
    Assert.areEqual(0, [SELECT COUNT() FROM CampLabel__c WITH SYSTEM_MODE]);
  }

  @IsTest
  static void editAccessToASeasonDoesNotAllowDeletingIt() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    User scheduler = ShoreshTestData.scheduler();
    Database.insert(
      new Season__Share(
        ParentId = season.Id,
        UserOrGroupId = scheduler.Id,
        AccessLevel = 'Edit'
      ),
      AccessLevel.SYSTEM_MODE
    );
    System.runAs(scheduler) {
      try {
        SeasonSetupController.deleteRecord(season.Id);
        Assert.fail('Edit access is not delete access');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          'You don\'t have access to change this. Ask the person who set it up, or a Salesforce admin.',
          errorOf(e)
        );
      }
    }
    Assert.areEqual(1, [SELECT COUNT() FROM Season__c WITH SYSTEM_MODE]);
  }

  @IsTest
  static void aSeasonWithNoWeekdaysSaysSoInsteadOfDoingNothing() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = new Season__c(
        Name = 'A weekend',
        Camp__c = camp.Id,
        StartDate__c = Date.newInstance(2026, 7, 4),
        EndDate__c = Date.newInstance(2026, 7, 5)
      );
      Database.insert(season, AccessLevel.SYSTEM_MODE);
      try {
        SeasonSetupController.addWeeksFromSeasonDates(season.Id);
        Assert.fail('Nothing to fill in is reported');
      } catch (AuraHandledException e) {
        Assert.isTrue(errorOf(e).contains('have no weekdays'), errorOf(e));
      }
    }
  }
}
