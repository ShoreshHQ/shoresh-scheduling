/**
 * Undo, for who lists (ImportUndoWho): an import's record is text that can be edited, so a
 * who-list entry whose object, owner, or lists were changed by hand is refused with the plain
 * "can't be read", and nothing is undone. Every test acts as a scheduler. Made-up camp only.
 */
@IsTest
private class ImportUndoWhoTest {
  // The record as each import wrote it, so each change starts from it.
  private static Map<Id, String> untampered = new Map<Id, String>();

  private class Camp {
    Id campId;
    Season__c season;
    RecurringActivity__c meeting;
    Id juniors;
    Id seniors;
    Id bunk1;
    Activity__c archery;
  }

  private static Camp camp() {
    Camp c = new Camp();
    Camp__c record = ShoreshTestData.camp('Pine Hollow (made up)');
    c.campId = record.Id;
    c.season = ShoreshTestData.season(record.Id, 'Summer 2027');
    Program__c program = ShoreshTestData.program(c.season.Id, 'Main');
    c.juniors = ShoreshTestData.division(program.Id, 'Juniors').Id;
    c.seniors = ShoreshTestData.division(program.Id, 'Seniors').Id;
    c.bunk1 = ShoreshTestData.groupIn(c.juniors, 'Bunk 1').Id;
    c.archery = ShoreshTestData.activity(c.season.Id, 'Archery', null);
    insert as user c.archery;
    insert as user new ActivityEligibility__c(
      Activity__c = c.archery.Id,
      Division__c = c.juniors
    );
    c.meeting = new RecurringActivity__c(
      Program__c = program.Id,
      Name = 'Meeting',
      TimeBlock__c = ShoreshTestData.timeBlock(program.Id, 'Period 1', 9).Id,
      Length__c = 1,
      Monday__c = true
    );
    insert as user c.meeting;
    insert as user new Coverage__c(
      Season__c = c.season.Id,
      RecurringActivity__c = c.meeting.Id,
      Division__c = c.juniors
    );
    return c;
  }

  private static ImportSetupSaves.Result save(Map<String, Object> plan) {
    return ImportController.saveList(JSON.serialize(plan));
  }

  private static Map<String, Object> plan(Id seasonId, List<Object> records) {
    return new Map<String, Object>{
      'seasonId' => seasonId,
      'screen' => 'activities',
      'files' => 'activities.csv (Activities)',
      'records' => records,
      'remember' => new List<Object>(),
      'forget' => new List<Object>()
    };
  }

  /** Archery's who list changed by a list import, for Undo to put back. */
  private static ImportSetupSaves.Result changeArcheryWho(Camp c) {
    return changeWho('Activity', c.archery.Id, c);
  }

  /** An item's who list changed to Seniors and Bunk 1 by a list import. */
  private static ImportSetupSaves.Result changeWho(
    String kind,
    Id itemId,
    Camp c
  ) {
    return save(
      plan(
        c.season.Id,
        new List<Object>{
          new Map<String, Object>{
            'kind' => kind,
            'id' => itemId,
            'fields' => new Map<String, Object>(),
            'refs' => new Map<String, Object>(),
            'who' => new List<Object>{ c.seniors, c.bunk1 }
          }
        }
      )
    );
  }

  /**
   * The import's record with its who-list entry changed by hand (system mode: a scheduler can't),
   * then Undo: refused plainly, nothing undone.
   */
  private static void expectWhoTamperRefused(
    Id importId,
    String key,
    Object value
  ) {
    // Each change starts from the record as the import wrote it.
    if (!untampered.containsKey(importId)) {
      untampered.put(
        importId,
        [SELECT Changed__c FROM Import__c WHERE Id = :importId].Changed__c
      );
    }
    List<Object> changed = (List<Object>) JSON.deserializeUntyped(
      untampered.get(importId)
    );
    for (Object entry : changed) {
      Map<String, Object> values = (Map<String, Object>) entry;
      if (values.containsKey('who')) {
        values.put(key, value);
      }
    }
    Database.update(
      new Import__c(Id = importId, Changed__c = JSON.serialize(changed)),
      AccessLevel.SYSTEM_MODE
    );
    try {
      ImportController.undoImport(importId);
      Assert.fail('refused: ' + key + ' = ' + value);
    } catch (AuraHandledException e) {
      Assert.isTrue(e.getMessage().contains('can\'t be read'), e.getMessage());
    }
  }

  /** A who-list entry whose object, owner, or lists were changed by hand is refused plainly. */
  @IsTest
  static void aTamperedWhoListIsRefusedPlainly() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      ImportSetupSaves.Result result = changeArcheryWho(c);
      expectWhoTamperRefused(result.importId, 'type', 5);
      expectWhoTamperRefused(result.importId, 'type', 'Contact');
      expectWhoTamperRefused(result.importId, 'type', null);
      // The other kind of who list: its owner would be a recurring activity, not Archery.
      expectWhoTamperRefused(result.importId, 'type', 'Coverage__c');
      expectWhoTamperRefused(result.importId, 'who', c.bunk1);
      // An owner of an object imports never write.
      expectWhoTamperRefused(result.importId, 'who', c.campId);
      expectWhoTamperRefused(result.importId, 'name', 5);
      Assert.areEqual(
        2,
        [
          SELECT COUNT()
          FROM ActivityEligibility__c
          WHERE Activity__c = :c.archery.Id
        ],
        'Nothing was undone'
      );
    }
  }

  @IsTest
  static void aWhoListWithTamperedTargetsIsRefusedPlainly() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      ImportSetupSaves.Result result = changeArcheryWho(c);
      expectWhoTamperRefused(result.importId, 'before', 'not a list');
      expectWhoTamperRefused(
        result.importId,
        'before',
        new List<Object>{ c.archery.Id }
      );
      expectWhoTamperRefused(result.importId, 'after', new List<Object>{ 7 });
      // A target of an object imports never write.
      expectWhoTamperRefused(
        result.importId,
        'before',
        new List<Object>{ c.campId }
      );
      Assert.areEqual(
        2,
        [
          SELECT COUNT()
          FROM ActivityEligibility__c
          WHERE Activity__c = :c.archery.Id
        ],
        'Nothing was undone'
      );

      // The control: the record as the import wrote it is undone (so each refusal above was
      // for what was changed).
      Database.update(
        new Import__c(
          Id = result.importId,
          Changed__c = untampered.get(result.importId)
        ),
        AccessLevel.SYSTEM_MODE
      );
      ImportController.undoImport(result.importId);
      List<ActivityEligibility__c> back = [
        SELECT Division__c
        FROM ActivityEligibility__c
        WHERE Activity__c = :c.archery.Id
      ];
      Assert.areEqual(1, back.size(), 'Back to one row');
      Assert.areEqual(c.juniors, back[0].Division__c, 'Back to Juniors');
    }
  }

  /** A recurring activity's who list (Coverage__c rows) passes the owner check and is undone. */
  @IsTest
  static void anUntamperedCoverageListIsUndone() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      ImportSetupSaves.Result result = changeWho(
        'RecurringActivity',
        c.meeting.Id,
        c
      );
      Import__c logged = [
        SELECT Changed__c
        FROM Import__c
        WHERE Id = :result.importId
      ];
      Assert.isTrue(
        logged.Changed__c.contains('"type":"Coverage__c"'),
        logged.Changed__c
      );
      Assert.areEqual(
        2,
        [
          SELECT COUNT()
          FROM Coverage__c
          WHERE RecurringActivity__c = :c.meeting.Id
        ],
        'Changed to two'
      );
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      List<Coverage__c> back = [
        SELECT Division__c, Season__c
        FROM Coverage__c
        WHERE RecurringActivity__c = :c.meeting.Id
      ];
      Assert.areEqual(1, back.size(), 'Back to one row');
      Assert.areEqual(c.juniors, back[0].Division__c, 'Back to Juniors');
      Assert.areEqual(c.season.Id, back[0].Season__c, 'In its season');
      Assert.areEqual(1, undone.restored, 'One list put back');
    }
  }

  /** A record holding something that isn't an entry at all is refused plainly. */
  @IsTest
  static void somethingThatIsNotAnEntryIsRefusedPlainly() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      ImportSetupSaves.Result result = changeArcheryWho(c);
      Database.update(
        new Import__c(Id = result.importId, Changed__c = '[5]'),
        AccessLevel.SYSTEM_MODE
      );
      try {
        ImportController.undoImport(result.importId);
        Assert.fail('a record holding a number must be refused');
      } catch (AuraHandledException e) {
        Assert.isTrue(
          e.getMessage().contains('can\'t be read'),
          e.getMessage()
        );
      }
    }
  }

  /**
   * A large camp's Undo of an import that replaced who can do 164 activities (11 bunks each:
   * 1,804 rows) and who a recurring activity covers (11 bunks): every row goes and the lists come
   * back. Salesforce refuses one save whose rows switch kind more than ten times, counted 200
   * rows at a time (#465): the old single delete was 10 + 1 = 11 chunks. Each kind now goes in its
   * own call (INGEST-5.10).
   */
  @IsTest
  static void ingest510ALargeCampsWhoListsOfBothKindsAreAllUndone() {
    System.runAs(ShoreshTestData.scheduler()) {
      // The clash check runs once, at the end of the setup, as a screen save does.
      SetTimeGuard.defer();
      Camp c;
      Id importId;
      List<Activity__c> activities = new List<Activity__c>();
      try {
        c = camp();
        importId = setUpLargeCamp(c, activities);
        SetTimeGuard.checkPending();
      } finally {
        SetTimeGuard.resume();
      }
      Test.startTest();
      Integer before = Limits.getQueries();
      ImportController.undoImport(importId);
      Integer used = Limits.getQueries() - before;
      Test.stopTest();
      Assert.isTrue(used < 60, 'Undo used ' + used + ' queries');
      Assert.areEqual(
        activities.size(),
        [
          SELECT COUNT()
          FROM ActivityEligibility__c
          WHERE Activity__c IN :activities AND Division__c = :c.juniors
          WITH USER_MODE
        ]
      );
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM ActivityEligibility__c
          WHERE Activity__c IN :activities AND Group__c != NULL
          WITH USER_MODE
        ]
      );
      List<Coverage__c> meeting = [
        SELECT Division__c, Group__c
        FROM Coverage__c
        WHERE RecurringActivity__c = :c.meeting.Id
        WITH USER_MODE
      ];
      Assert.areEqual(1, meeting.size());
      Assert.areEqual(c.juniors, meeting[0].Division__c);
    }
  }

  /**
   * The large camp's lists as a workbook import left them, with its record (activities: filled
   * here): 11 senior bunks can do each of 164 activities, and Meeting covers them, in place of
   * Juniors.
   */
  private static Id setUpLargeCamp(Camp c, List<Activity__c> activities) {
    Id importId = changeArcheryWho(c).importId;
    List<Group__c> bunks = new List<Group__c>();
    for (Integer i = 0; i < 11; i++) {
      bunks.add(
        new Group__c(
          Division__c = c.seniors,
          Name = 'Senior bunk ' + i,
          Availability__c = 'MorningOnly',
          SortOrder__c = 10 + i
        )
      );
    }
    insert as user bunks;
    List<String> after = new List<String>();
    for (Group__c bunk : bunks) {
      after.add(bunk.Id);
    }
    after.sort();
    for (Integer i = 0; i < 164; i++) {
      activities.add(ShoreshTestData.activity(c.season.Id, 'Craft ' + i, null));
    }
    insert as user activities;
    List<ActivityEligibility__c> eligible = new List<ActivityEligibility__c>();
    List<Coverage__c> covered = new List<Coverage__c>();
    List<Object> changed = new List<Object>();
    for (Activity__c activity : activities) {
      for (Group__c bunk : bunks) {
        eligible.add(
          new ActivityEligibility__c(
            Activity__c = activity.Id,
            Group__c = bunk.Id
          )
        );
      }
      changed.add(
        new ImportLogEntries.Who(
            activity,
            ShoreshSchema.localName(ActivityEligibility__c.SObjectType)
          )
          .lists(new List<String>{ c.juniors }, after)
          .toLog()
      );
    }
    // Meeting covered the bunks in place of Juniors.
    delete as user [
      SELECT Id
      FROM Coverage__c
      WHERE RecurringActivity__c = :c.meeting.Id
      WITH USER_MODE
    ];
    for (Group__c bunk : bunks) {
      covered.add(
        new Coverage__c(
          Season__c = c.season.Id,
          RecurringActivity__c = c.meeting.Id,
          Group__c = bunk.Id
        )
      );
    }
    changed.add(
      new ImportLogEntries.Who(
          c.meeting,
          ShoreshSchema.localName(Coverage__c.SObjectType)
        )
        .lists(new List<String>{ c.juniors }, after)
        .toLog()
    );
    insert as user eligible;
    insert as user covered;
    // The import's record as a workbook import that replaced all 165 lists would leave it.
    Database.update(
      new Import__c(Id = importId, Changed__c = JSON.serialize(changed)),
      AccessLevel.SYSTEM_MODE
    );
    return importId;
  }
}
