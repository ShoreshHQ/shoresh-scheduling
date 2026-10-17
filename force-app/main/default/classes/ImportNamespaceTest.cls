/**
 * Namespace safety for imports and Undo (namespace retrofit, part 2). Once the package has its
 * `shoresh` namespace, screens name fields with the prefix and rows report them that way. Here
 * ShoreshSchema simulates it: a workbook spelled with the prefix saves the same, its log keeps
 * local names, and a log spelled with the prefix is undone exactly as one without; the prefix
 * never lets a field off ImportFields' lists through. Made-up camp only.
 */
@IsTest
private class ImportNamespaceTest {
  private static final String PREFIX = 'shoresh__';

  private class Camp {
    Camp__c camp;
    Season__c season;
    List<Week__c> weeks;
    Activity__c swim;
    WeekException__c swimOffWeek2;
  }

  private static Camp camp() {
    Camp c = new Camp();
    c.camp = ShoreshTestData.camp('Birch Hollow (made up)');
    c.season = ShoreshTestData.season(c.camp.Id, 'Summer 2026');
    c.weeks = ShoreshTestData.weeks(c.season.Id, 3);
    c.swim = ShoreshTestData.activity(c.season.Id, 'Swim', null);
    insert as user c.swim;
    c.swimOffWeek2 = new WeekException__c(
      Week__c = c.weeks[1].Id,
      Activity__c = c.swim.Id
    );
    insert as user c.swimOffWeek2;
    return c;
  }

  private static Map<String, Object> rec(
    String kind,
    String keyOrId,
    Map<String, Object> fields
  ) {
    Map<String, Object> r = new Map<String, Object>{
      'kind' => kind,
      'fields' => fields,
      'refs' => new Map<String, Object>()
    };
    r.put(keyOrId.contains(':') ? 'key' : 'id', keyOrId);
    return r;
  }

  private static Map<String, Object> workbook(Camp c, List<Object> words) {
    Map<String, Object> archery = rec(
      'Activity',
      'Activity:Archery',
      new Map<String, Object>{
        'Name' => 'Archery',
        'Length__c' => 1,
        'TimesPerWeekMin__c' => 1,
        'TimesPerWeekMax__c' => 2,
        'Priority__c' => 'Low',
        'GroupsAtOnce__c' => 1
      }
    );
    archery.put('who', new List<Object>());
    Map<String, Object> archeryOff = rec(
      'WeekException',
      'WeekException:Activity:Archery:Week:2026-07-20',
      new Map<String, Object>()
    );
    archeryOff.put(
      'refs',
      new Map<String, Object>{
        'Week__c' => 'Week:2026-07-20',
        'Activity__c' => 'Activity:Archery'
      }
    );
    Map<String, Object> swimBackOn = rec(
      'WeekException',
      c.swimOffWeek2.Id,
      new Map<String, Object>()
    );
    swimBackOn.put('remove', true);
    return new Map<String, Object>{
      'seasonId' => c.season.Id,
      'files' => 'camp.xlsx',
      'remember' => new List<Object>(),
      'forget' => new List<Object>(),
      'campWords' => words,
      'records' => new List<Object>{
        rec(
          'Week',
          'Week:2026-07-20',
          new Map<String, Object>{
            'Name' => 'Week 4',
            'StartDate__c' => '2026-07-20',
            'EndDate__c' => '2026-07-24'
          }
        ),
        rec(
          'Week',
          c.weeks[0].Id,
          new Map<String, Object>{
            'Name' => 'Opening week',
            'EndDate__c' => '2026-07-02'
          }
        ),
        archery,
        archeryOff,
        swimBackOn
      }
    };
  }

  private static Map<String, Object> word(Map<String, Object> fields) {
    return new Map<String, Object>{
      'kind' => 'CampLabel',
      'term' => 'Group',
      'fields' => fields
    };
  }

  private static ImportSetupSaves.Result importPackaged(Camp c) {
    List<Object> words = new List<Object>{
      word(
        new Map<String, Object>{
          'Singular__c' => 'Cabin',
          'Plural__c' => 'Cabins'
        }
      )
    };
    return ImportController.saveWorkbook(
      JSON.serialize(ImportTestPlans.packaged(workbook(c, words)))
    );
  }

  @IsTest
  static void aWorkbookSpelledWithTheNamespaceSavesTheSameAndLogsLocalNames() {
    System.runAs(ShoreshTestData.scheduler()) {
      ShoreshSchema.simulatedPrefix = PREFIX;
      Camp c = camp();
      ImportSetupSaves.Result result = importPackaged(c);
      Assert.areEqual(1, result.added.get('Week'), 'Week added');
      Assert.areEqual(1, result.added.get('CampLabel'), 'Word added');
      Assert.areEqual(
        Date.newInstance(2026, 7, 2),
        [SELECT EndDate__c FROM Week__c WHERE Id = :c.weeks[0].Id].EndDate__c,
        'Week changed'
      );
      Assert.areEqual(
        'Cabin',
        CampLabels.forCamp(c.camp.Id).singular('Group'),
        'Camp word'
      );
      Import__c logged = [
        SELECT Created__c, Changed__c
        FROM Import__c
        WHERE Id = :result.importId
      ];
      // Only Shoresh's prefix is simulated: the platform still reports bare names here, so this
      // shows the screen's prefixed names don't reach the log. That logs keep local names when
      // the platform itself reports prefixed ones is checked after the namespace is registered.
      Assert.isFalse(
        (logged.Created__c + logged.Changed__c).contains(PREFIX),
        'Screen spellings stay out of the log'
      );
      Assert.isTrue(
        logged.Changed__c.contains('"type":"Week__c"'),
        logged.Changed__c
      );
    }
  }

  @IsTest
  static void aLogSpelledWithTheNamespaceIsUndoneTheSame() {
    System.runAs(ShoreshTestData.scheduler()) {
      ShoreshSchema.simulatedPrefix = PREFIX;
      Camp c = camp();
      ImportSetupSaves.Result result = importPackaged(c);
      Import__c packaged = ImportTestPlans.packageLog(result.importId);
      for (
        String spelled : new List<String>{
          '"' +
          PREFIX +
          'EndDate__c"',
          '"field":"' +
          PREFIX +
          'Activity__c"',
          '"type":"' +
          PREFIX +
          'Week__c"'
        }
      ) {
        Assert.isTrue(packaged.Changed__c.contains(spelled), spelled);
      }
      Assert.isTrue(
        packaged.Created__c.contains('"' + PREFIX + 'StartDate__c"'),
        packaged.Created__c
      );

      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Week__c WHERE Name = 'Week 4'],
        'Added week removed'
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Activity__c WHERE Name = 'Archery'],
        'Added activity removed'
      );
      Assert.areEqual(
        'Week 1',
        [SELECT Name FROM Week__c WHERE Id = :c.weeks[0].Id].Name,
        'Changed week put back'
      );
      Assert.areEqual(
        c.weeks[1].Id,
        [SELECT Week__c FROM WeekException__c WHERE Activity__c = :c.swim.Id]
        .Week__c,
        'Week off put back'
      );
      Assert.areEqual(
        'Group',
        CampLabels.forCamp(c.camp.Id).singular('Group'),
        'Camp word removed'
      );
      Assert.areEqual(
        0,
        undone.keptEdited.size(),
        'Nothing reads as edited: ' + undone.keptEdited
      );
    }
  }

  /** An import's log changed by hand to name this field: Undo refuses it. */
  private static void expectFieldRefused(
    Id importId,
    Id recordId,
    String field
  ) {
    Import__c done = new Import__c(
      Id = importId,
      Changed__c = JSON.serialize(
        new List<Object>{
          new Map<String, Object>{
            'id' => recordId,
            'type' => 'x',
            'name' => 'x',
            'before' => new Map<String, Object>{ field => null },
            'after' => new Map<String, Object>{ field => null }
          }
        }
      )
    );
    Database.update(done, AccessLevel.SYSTEM_MODE);
    try {
      ImportController.undoImport(importId);
      Assert.fail('refused: ' + field);
    } catch (AuraHandledException e) {
      Assert.isTrue(e.getMessage().contains('can\'t be read'), e.getMessage());
    }
  }

  @IsTest
  static void theNamespaceNeverLetsAFieldOffTheListThrough() {
    System.runAs(ShoreshTestData.scheduler()) {
      ShoreshSchema.simulatedPrefix = PREFIX;
      Camp c = camp();
      ImportSetupSaves.Result result = importPackaged(c);
      expectFieldRefused(result.importId, c.swim.Id, PREFIX + 'CopiedFrom__c');
      expectFieldRefused(result.importId, c.swim.Id, 'other__Length__c');
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Week__c WHERE Name = 'Week 4'],
        'Nothing was undone'
      );
    }
  }

  /** A workbook whose camp word names these fields: refused, nothing saved. */
  private static void expectWordRefused(Camp c, Map<String, Object> fields) {
    try {
      ImportController.saveWorkbook(
        JSON.serialize(workbook(c, new List<Object>{ word(fields) }))
      );
      Assert.fail('refused: ' + fields.keySet());
    } catch (AuraHandledException e) {
      Assert.isNotNull(e.getMessage(), 'Says why');
    }
  }

  @IsTest
  static void aCampWordMayNameOnlyItsSingularAndPlural() {
    System.runAs(ShoreshTestData.scheduler()) {
      ShoreshSchema.simulatedPrefix = PREFIX;
      Camp c = camp();
      expectWordRefused(
        c,
        new Map<String, Object>{
          'Singular__c' => 'Cabin',
          'ModelTerm__c' => 'Week'
        }
      );
      // The same field twice, spelled both ways.
      expectWordRefused(
        c,
        new Map<String, Object>{
          'Singular__c' => 'Cabin',
          PREFIX + 'Singular__c' => 'Bunk'
        }
      );
      Assert.areEqual(
        'Group',
        CampLabels.forCamp(c.camp.Id).singular('Group'),
        'Nothing saved'
      );
    }
  }

  /** One field sent twice, spelled with and without the prefix: refused, not guessed at. */
  @IsTest
  static void aFieldSentTwiceInTwoSpellingsIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      ShoreshSchema.simulatedPrefix = PREFIX;
      Camp c = camp();
      Map<String, Object> plan = workbook(c, new List<Object>());
      Map<String, Object> week = (Map<String, Object>) ((List<Object>) plan.get(
        'records'
      ))[1];
      ((Map<String, Object>) week.get('fields'))
        .put(PREFIX + 'EndDate__c', '2026-07-03');
      try {
        ImportController.saveWorkbook(JSON.serialize(plan));
        Assert.fail('a field sent twice must be refused');
      } catch (AuraHandledException e) {
        Assert.isNotNull(e.getMessage(), 'Says why');
      }
      Assert.areEqual(
        'Week 1',
        [SELECT Name FROM Week__c WHERE Id = :c.weeks[0].Id].Name,
        'Nothing saved'
      );
    }
  }
}
