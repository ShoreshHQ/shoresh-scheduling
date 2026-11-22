@IsTest
private class ScreenErrorsTest {
  @IsTest
  static void aRefusedDeleteIsExplainedInPlainWords() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    ShoreshTestData.season(camp.Id, 'Summer 2026');
    try {
      Database.delete(camp, AccessLevel.SYSTEM_MODE);
      Assert.fail('A camp with seasons is kept');
    } catch (DmlException e) {
      Assert.areEqual(
        'This can\'t be deleted while something else still uses it. Change that first.',
        ScreenErrors.of(e).getMessage(),
        'The platform\'s own wording, which names objects, is not shown'
      );
    }
  }

  @IsTest
  static void otherProblemsKeepTheirOwnMessage() {
    Assert.areEqual(
      'Plain words.',
      ScreenErrors.of(new ShoreshException('Plain words.')).getMessage()
    );
  }

  @IsTest
  static void aCheckOnSaveKeepsItsOwnMessage() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    Week__c first = ShoreshTestData.weeks(season.Id, 1)[0];
    try {
      Database.insert(
        new Week__c(
          Season__c = season.Id,
          Name = 'Again',
          StartDate__c = first.StartDate__c,
          EndDate__c = first.EndDate__c
        ),
        AccessLevel.SYSTEM_MODE
      );
      Assert.fail('Two weeks never start on the same day');
    } catch (DmlException e) {
      String shown = ScreenErrors.of(e).getMessage();
      Assert.areEqual(e.getDmlMessage(0), shown);
      Assert.areNotEqual('Shoresh couldn\'t tell why. Try again.', shown);
    }
  }

  @IsTest
  static void anythingElseSaysShoreshCouldNotTellWhy() {
    Exception unexpected;
    try {
      List<Integer> none = new List<Integer>();
      Assert.fail('Not reached: ' + none[3]);
    } catch (Exception e) {
      unexpected = e;
    }
    Assert.areEqual(
      'Shoresh couldn\'t tell why. Try again.',
      ScreenErrors.of(unexpected)
        .getMessage()
        .replaceAll(' For support: [A-Z0-9]{3}-[A-Z0-9]{3}\\.$', '')
    );
    Assert.areEqual(
      'Shoresh couldn\'t tell why. Reload the page to try again.',
      ScreenErrors.ofLoading(unexpected)
        .getMessage()
        .replaceAll(' For support: [A-Z0-9]{3}-[A-Z0-9]{3}\\.$', '')
    );
  }

  @IsTest
  static void somethingRemovedMeanwhileSaysToReload() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    Program__c gone = ShoreshTestData.program(season.Id, 'Main');
    Database.delete(gone, AccessLevel.SYSTEM_MODE);
    try {
      UserModeWrites.save(
        new List<SObject>{ new Program__c(Id = gone.Id, Name = 'Renamed') }
      );
      Assert.fail('A removed row is not saved');
    } catch (UserModeWrites.SaveException e) {
      Assert.areEqual(
        '"Renamed": That was removed. Reload the page.',
        ScreenErrors.of(e).getMessage()
      );
    }
  }

  // API-1.105: an AI or the command line has no page to reload; it hears the problem alone.
  @IsTest
  static void anAiIsNeverToldToReloadThePage() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    Program__c gone = ShoreshTestData.program(season.Id, 'Main');
    Database.delete(gone, AccessLevel.SYSTEM_MODE);
    Exception unexpected;
    try {
      List<Integer> none = new List<Integer>();
      Assert.fail('Not reached: ' + none[3]);
    } catch (Exception e) {
      unexpected = e;
    }
    AgentRefusal.forAgent = true;
    try {
      UserModeWrites.save(
        new List<SObject>{ new Program__c(Id = gone.Id, Name = 'Renamed') }
      );
      Assert.fail('A removed row is not saved');
    } catch (UserModeWrites.SaveException e) {
      Assert.areEqual('"Renamed": That was removed.', ScreenErrors.words(e));
    } finally {
      AgentRefusal.forAgent = false;
    }
    Assert.areEqual(
      'Shoresh couldn\'t tell why. Try again.',
      ScreenErrors.words(unexpected)
        .replaceAll(' For support: [A-Z0-9]{3}-[A-Z0-9]{3}\\.$', '')
    );
    // A screen's read an AI goes through (read_elective_seats_now's openRun, and the rest).
    AgentRefusal.forAgent = true;
    String loading = ScreenErrors.ofLoading(unexpected)
      .getMessage()
      .replaceAll(' For support: [A-Z0-9]{3}-[A-Z0-9]{3}\\.$', '');
    String goneRun;
    try {
      ElectiveSeatsController.openRun(
        Id.valueOf(
          ElectiveRun__c.SObjectType.getDescribe(
              SObjectDescribeOptions.DEFERRED
            )
            .getKeyPrefix() + '000000000000'
        )
      );
    } catch (AuraHandledException e) {
      goneRun = e.getMessage();
    }
    AgentRefusal.forAgent = false;
    Assert.areEqual('Shoresh couldn\'t tell why. Try again.', loading);
    Assert.areEqual('These seats are no longer there.', goneRun);
  }

  @IsTest
  static void aNumberedRowIsNotNamedInTheMessage() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    CampLabel__c label = new CampLabel__c(
      Camp__c = camp.Id,
      ModelTerm__c = 'Group',
      Singular__c = 'Bunk',
      Plural__c = 'Bunks'
    );
    Database.insert(label, AccessLevel.SYSTEM_MODE);
    try {
      // A change to a saved row is where its name (here CL-00001) used to be read.
      UserModeWrites.save(
        new List<SObject>{ new CampLabel__c(Id = label.Id, Singular__c = null) }
      );
      Assert.fail('A label needs its words');
    } catch (UserModeWrites.SaveException e) {
      Assert.areEqual(
        'Something required is blank. Fill it in and save again.',
        ScreenErrors.of(e).getMessage(),
        'No "CL-00001" in front'
      );
    }
  }

  @IsTest
  static void aWeekIsNamedInTheCampsOwnWord() {
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
    Week__c saved = ShoreshTestData.weeks(season.Id, 1)[0];
    Assert.areEqual(
      'Session',
      ScreenErrorWords.forWeek(new Week__c(Season__c = season.Id))
        .singularInSentence('Week')
    );
    Assert.areEqual(
      'Session',
      ScreenErrorWords.forWeek(new Week__c(Id = saved.Id))
        .singularInSentence('Week')
    );
    Assert.areEqual(
      'week',
      ScreenErrorWords.forWeek(new Week__c()).singularInSentence('Week'),
      'Unknown camp: the standard word'
    );
  }

  @IsTest
  static void aMissingSeasonIsNamedInTheCampsOwnWord() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Database.insert(
      new CampLabel__c(
        Camp__c = camp.Id,
        ModelTerm__c = 'Season',
        Singular__c = 'Session',
        Plural__c = 'Sessions'
      ),
      AccessLevel.SYSTEM_MODE
    );
    Season__c gone = ShoreshTestData.season(camp.Id, 'Summer 2025');
    Database.delete(gone, AccessLevel.SYSTEM_MODE);
    try {
      SeasonSetupController.getSeasonSetupInCamp(camp.Id, gone.Id);
      Assert.fail('A removed season is not shown');
    } catch (AuraHandledException e) {
      Assert.areEqual(
        'That Session wasn\'t found. Reload the page.',
        e.getMessage()
      );
    }
  }

  @IsTest
  static void aSeasonFromAnotherCampIsNotShown() {
    Camp__c willow = ShoreshTestData.camp('Camp Willow');
    Camp__c cedar = ShoreshTestData.camp('Camp Cedar');
    Season__c cedars = ShoreshTestData.season(cedar.Id, 'Summer 2026');
    Assert.isNotNull(
      SeasonSetupController.getSeasonSetupInCamp(cedar.Id, cedars.Id),
      'Its own camp sees it'
    );
    try {
      SeasonSetupController.getSeasonSetupInCamp(willow.Id, cedars.Id);
      Assert.fail('Another camp\'s season is refused');
    } catch (AuraHandledException e) {
      Assert.areEqual(
        'That season wasn\'t found. Reload the page.',
        e.getMessage()
      );
    }
  }

  @IsTest
  static void aMessageFromElsewhereKeepsTheRowsName() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    Week__c week = ShoreshTestData.weeks(season.Id, 1)[0];
    try {
      // The date rule's own message happens to start with this week's name.
      UserModeWrites.save(
        new List<SObject>{
          new Week__c(
            Id = week.Id,
            Name = 'End date',
            EndDate__c = week.StartDate__c.addDays(-1)
          )
        }
      );
      Assert.fail('Backwards dates are refused');
    } catch (UserModeWrites.SaveException e) {
      Assert.areEqual(
        '"End date": End date is before Start date.',
        ScreenErrors.of(e).getMessage()
      );
    }
  }

  /** A refusal from a partial delete (as Undo meets one) is in the same plain words. */
  @IsTest
  static void aRefusalFromAPartialDeleteIsInPlainWords() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    ShoreshTestData.season(camp.Id, 'Summer 2026');
    Database.DeleteResult outcome = Database.delete(
      camp,
      false,
      AccessLevel.SYSTEM_MODE
    );
    Assert.isFalse(outcome.isSuccess());
    Assert.areEqual(
      'This can\'t be deleted while something else still uses it. Change that first.',
      ScreenErrors.messageOf(outcome.getErrors()[0])
    );
  }

  @IsTest
  static void twoSavesAtOnceSayAnotherSaveIsStillGoing() {
    String busy = 'Another save in this season is still going. Try again in a moment.';
    Assert.areEqual(
      busy,
      ScreenErrors.plainOrNull(StatusCode.UNABLE_TO_LOCK_ROW)
    );
    Assert.areEqual(
      busy,
      ScreenErrors.words(
        new QueryException(
          'Record Currently Unavailable: The record you are attempting to edit, or one of its related records, is currently being modified by another user. Please try again later.'
        )
      ),
      'Salesforce\'s own wording for a held record is never shown'
    );
    Assert.isTrue(
      ScreenErrors.words(new QueryException('List has no rows'))
        .startsWith('Shoresh couldn\'t tell why.'),
      'Any other read problem is still unknown'
    );
  }
}
