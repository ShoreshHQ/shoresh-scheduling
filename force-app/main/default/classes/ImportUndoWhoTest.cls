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
}
