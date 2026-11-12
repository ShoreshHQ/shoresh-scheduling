/**
 * SetupDelete: the question before a setup delete, in Camp Setup's words, for each kind of record;
 * what refuses it; and the delete itself, remembered and taking with it what goes with it. The
 * AI's question (API-1.102) is the same preview, word for word.
 */
@IsTest
private class SetupDeleteTest {
  /**
   * Teens, a program nothing else uses (Main's groups are in "Who can do it"), with a Manual
   * Build, a Generated draft and saved versions of its weeks.
   */
  private static Id teensWithSchedules(Map<String, Id> ids) {
    Id main = ShoreshTestData.program(ids.get('Season'), 'Teens').Id;
    Database.insert(
      new List<Schedule__c>{
        new Schedule__c(
          Program__c = main,
          Week__c = ids.get('Week 1'),
          Name = 'Build',
          Status__c = 'Draft',
          Origin__c = 'Manual'
        ),
        new Schedule__c(
          Program__c = main,
          Week__c = ids.get('Week 2'),
          Name = 'Generated',
          Status__c = 'Draft',
          Origin__c = 'Generated'
        )
      },
      AccessLevel.SYSTEM_MODE
    );
    ShoreshTestData.savedVersion(main, ids.get('Week 1'), 'V1');
    ShoreshTestData.savedVersion(main, ids.get('Week 1'), 'V2');
    return main;
  }

  private static Id specialDay(Map<String, Id> ids, String name) {
    SpecialDay__c day = new SpecialDay__c(
      Season__c = ids.get('Season'),
      Name = name
    );
    Database.insert(day, AccessLevel.USER_MODE);
    return day.Id;
  }

  // MEMO-4.2, API-1.102: a program's drafts and versions go with it (Schedule__c.Program__c is
  // master-detail), and its question says so.
  @IsTest
  static void deletingAProgramNamesItsSchedulesAndTakesThem() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id teens = teensWithSchedules(ids);
      Test.startTest();
      SetupDelete.Preview preview = SetupDelete.preview(teens);
      Integer queries = Limits.getQueries();
      Test.stopTest();
      Assert.isTrue(
        queries < 30,
        'The question stays well under 100: ' + queries
      );
      Assert.isNull(preview.refusal);
      // Word walk W4: the question names the action, and its lines say what really happens.
      Assert.areEqual('Delete Teens?', preview.label);
      Assert.areEqual('Delete Teens', preview.confirmLabel);
      Assert.areEqual(
        'Delete Teens? Anything inside it is deleted too. That includes its Manual Build, its Generated Schedule and 2 saved versions.',
        preview.message
      );
      Assert.areEqual(
        new List<String>{
          'Anything inside it is deleted too. That includes its Manual Build, its Generated Schedule and 2 saved versions.'
        },
        preview.lines
      );
    }
  }

  // API-1.102: a week names its schedules, then the special days and events it takes off its days.
  @IsTest
  static void deletingAWeekNamesItsSchedulesAndTheSpecialDaysItTakesOff() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      teensWithSchedules(ids);
      Id fieldDay = specialDay(ids, 'Field Day');
      SpecialEvent__c carnival = new SpecialEvent__c(
        Season__c = ids.get('Season'),
        Name = 'Carnival'
      );
      Database.insert(carnival, AccessLevel.USER_MODE);
      SpecialDates.place(fieldDay, ids.get('Week 1'), 'Tuesday');
      SpecialDates.place(fieldDay, ids.get('Week 2'), 'Friday');
      SpecialDates.place(carnival.Id, ids.get('Week 1'), 'Thursday');
      SpecialDates.place(carnival.Id, ids.get('Week 1'), 'Wednesday');
      Test.startTest();
      SetupDelete.Preview preview = SetupDelete.preview(ids.get('Week 1'));
      Test.stopTest();
      Assert.areEqual(
        'Delete Week 1? Anything inside it is deleted too. That includes its Manual Build and 2 saved versions. It takes "Field Day" off Tuesday and "Carnival" off Wednesday and Thursday.',
        preview.message
      );
    }
  }

  // ADR 0012 (2): a bunk or activity some schedule uses says how many; one none use asks as usual.
  @IsTest
  static void aBunkOrActivityInSchedulesSaysHowMany() {
    ScheduleUses.Count uses = new ScheduleUses.Count();
    uses.schedules = 2;
    Assert.areEqual(
      'Bunk 3 is in 2 schedules. Delete anyway?',
      SetupDelete.usedIn('Bunk 3', uses)
    );
    uses.schedules = 1;
    Assert.areEqual(
      'Swim is in 1 schedule. Delete anyway?',
      SetupDelete.usedIn('Swim', uses)
    );
    uses.schedules = 3;
    uses.complete = false;
    Assert.areEqual(
      'Swim is in 3 or more schedules. Delete anyway?',
      SetupDelete.usedIn('Swim', uses)
    );
    uses.schedules = 0;
    Assert.areEqual(
      'Shoresh couldn\'t count the schedules Swim is in. Delete anyway?',
      SetupDelete.usedIn('Swim', uses)
    );
    uses.complete = true;
    Assert.isNull(SetupDelete.usedIn('Swim', uses));

    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Test.startTest();
      SetupDelete.Preview preview = SetupDelete.preview(ids.get('Group B'));
      Test.stopTest();
      // A bunk has nothing inside it: nothing more is said.
      Assert.areEqual('Delete Group B?', preview.label);
      Assert.areEqual('Delete Group B?', preview.message);
      Assert.areEqual(new List<String>(), preview.lines);
      Assert.areEqual(0, preview.uses.schedules);
    }
  }

  // Word walk W4: a name another bunk shares is named with its division ("Bunk 2 (Juniors)").
  @IsTest
  static void aBunkWhoseNameIsSharedIsNamedWithItsDivision() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Database.insert(
        new Group__c(Division__c = ids.get('Seniors'), Name = 'Group B'),
        AccessLevel.USER_MODE
      );
      Test.startTest();
      SetupDelete.Preview preview = SetupDelete.preview(ids.get('Group B'));
      Test.stopTest();
      Assert.areEqual('Delete Group B (Juniors)?', preview.label);
      Assert.areEqual('Delete Group B (Juniors)', preview.confirmLabel);
    }
  }

  // Word walk W4: deleting a location type keeps its locations, and the question says so.
  @IsTest
  static void aLocationTypesQuestionSaysItsLocationsStay() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      LocationType__c water = new LocationType__c(
        Season__c = ids.get('Season'),
        Name = 'Water'
      );
      Database.insert(water, AccessLevel.USER_MODE);
      Database.insert(
        new List<Location__c>{
          new Location__c(
            Season__c = ids.get('Season'),
            Name = 'Pool',
            GroupsThatFit__c = 1,
            LocationType__c = water.Id
          ),
          new Location__c(
            Season__c = ids.get('Season'),
            Name = 'Lake',
            GroupsThatFit__c = 1,
            LocationType__c = water.Id
          )
        },
        AccessLevel.USER_MODE
      );
      Test.startTest();
      SetupDelete.Preview preview = SetupDelete.preview(water.Id);
      Test.stopTest();
      Assert.areEqual(
        new List<String>{ 'Its 2 locations stay, with no location type.' },
        preview.lines
      );
    }
  }

  // ADR 0012 (4): what something still uses is refused in the preview and by the delete alike.
  @IsTest
  static void whatSomethingUsesIsRefusedBeforeAndAtTheDelete() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Test.startTest();
      SetupDelete.Preview preview = SetupDelete.preview(ids.get('Gym'));
      String refused;
      try {
        SetupDelete.remove(ids.get('Gym'));
      } catch (Exception e) {
        refused = e.getMessage();
      }
      Test.stopTest();
      Assert.isTrue(
        preview.refusal.startsWith('This can\'t be deleted yet:'),
        preview.refusal
      );
      Assert.areEqual(preview.refusal, refused);
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM Location__c
          WHERE Id = :ids.get('Gym')
          WITH USER_MODE
        ]
      );
    }
  }

  // An offering is taken off its set, the activity kept; a linked choice names what a sheet then
  // counts it as.
  @IsTest
  static void anOfferingAndALinkedChoiceAskInTheElectivesWords() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      ElectiveSet__c chugim = new ElectiveSet__c(
        Season__c = ids.get('Season'),
        Name = 'Chugim'
      );
      Database.insert(chugim, AccessLevel.USER_MODE);
      Offering__c swim = new Offering__c(
        ElectiveSet__c = chugim.Id,
        Activity__c = ids.get('Swim')
      );
      Database.insert(swim, AccessLevel.USER_MODE);
      LinkedChoice__c linked = new LinkedChoice__c(
        ElectiveSet__c = chugim.Id,
        Name = 'Swim double',
        Offering__c = swim.Id,
        AppliesTo__c = 'All',
        SortOrder__c = 1
      );
      Database.insert(linked, AccessLevel.USER_MODE);
      Test.startTest();
      SetupDelete.Preview offering = SetupDelete.preview(swim.Id);
      SetupDelete.Preview choice = SetupDelete.preview(linked.Id);
      Test.stopTest();
      Assert.areEqual(
        'Take "Swim" off "Chugim"? The activity is kept.',
        offering.message
      );
      Assert.areEqual(
        'Delete "Swim double"? A sheet that names it then counts as Swim.',
        choice.message
      );
    }
  }

  // MEMO-4.2: the delete is remembered, so an import leaves it out; a program's schedules go
  // with it.
  @IsTest
  static void theDeleteIsRememberedAndTakesWhatGoesWithIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id timeBlock = ShoreshTestData.timeBlock(ids.get('Main'), 'Swim time', 15)
        .Id;
      Program__c other = ShoreshTestData.program(ids.get('Season'), 'Teens');
      ShoreshTestData.savedVersion(other.Id, ids.get('Week 1'), 'V');
      Test.startTest();
      SetupDelete.remove(timeBlock);
      SetupDelete.remove(other.Id);
      Test.stopTest();
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE Program__c = :other.Id
          WITH SYSTEM_MODE
        ]
      );
      Set<String> remembered = new Set<String>();
      for (ImportAnswer__c answer : [
        SELECT QuestionKey__c
        FROM ImportAnswer__c
        WITH SYSTEM_MODE
      ]) {
        remembered.add(answer.QuestionKey__c);
      }
      Assert.isTrue(
        remembered.contains('deleted|TimeBlock|Main|Swim time'),
        String.valueOf(remembered)
      );
      Assert.isTrue(
        remembered.contains('deleted|Program||Teens'),
        String.valueOf(remembered)
      );
    }
  }

  private class EverythingPublished implements PublishedHistory.Finder {
    public Set<Id> withPublishedHistory(Set<Id> recordIds) {
      return recordIds;
    }
  }

  // API-1.141: a season with published history is refused before its question (the screen's
  // preview), in the camp's words, with what to do instead; nothing is asked about or deleted.
  @IsTest
  static void aSeasonWithPublishedHistoryIsRefusedOfferingArchive() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      String name = [
        SELECT Name
        FROM Season__c
        WHERE Id = :ids.get('Season')
        WITH USER_MODE
      ]
      .Name;
      PublishedHistory.finder = new EverythingPublished();
      Test.startTest();
      SetupDelete.Preview preview = SetupDelete.preview(ids.get('Season'));
      Test.stopTest();
      Assert.areEqual(
        '"' +
          name +
          '" has published schedules, which are kept as history, so this season can\'t be deleted. Archive it instead.',
        preview.refusal
      );
      Assert.isNull(preview.message);
      Assert.isNull(preview.lines);
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Season__c WHERE Id = :ids.get('Season')]
      );
    }
  }

  @IsTest
  static void aCampOrUnknownRecordIsNotTheseScreensToDelete() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      for (Id recordId : new List<Id>{ ids.get('Camp'), null }) {
        try {
          SetupDelete.preview(recordId);
          Assert.fail('A camp is never deleted here');
        } catch (AuraHandledException e) {
          Assert.areEqual('These screens can\'t delete that.', e.getMessage());
        }
      }
    }
  }
}
