/**
 * Slice 4c part D: a camp workbook imported on Roots, saved all or none and undone together:
 * its weeks, its lists, the weeks items run, and the camp's words. Also: Undo reads nothing
 * from an import's record that an import doesn't write (security review). Made-up camp only.
 */
@IsTest
private class ImportWorkbookTest {
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

  private static Map<String, Object> plan(
    Id seasonId,
    List<Object> records,
    List<Object> campWords
  ) {
    return new Map<String, Object>{
      'seasonId' => seasonId,
      'files' => 'camp.xlsx',
      'records' => records,
      'campWords' => campWords,
      'remember' => new List<Object>(),
      'forget' => new List<Object>()
    };
  }

  private static Map<String, Object> rec(
    String kind,
    String keyOrId,
    Map<String, Object> fields,
    Map<String, Object> refs
  ) {
    Map<String, Object> r = new Map<String, Object>{
      'kind' => kind,
      'fields' => fields,
      'refs' => refs
    };
    r.put(keyOrId.contains(':') ? 'key' : 'id', keyOrId);
    return r;
  }

  private static Map<String, Object> word(
    String term,
    String singular,
    String plural
  ) {
    return new Map<String, Object>{
      'kind' => 'CampLabel',
      'term' => term,
      'fields' => new Map<String, Object>{
        'Singular__c' => singular,
        'Plural__c' => plural
      }
    };
  }

  /** A workbook adding a week and an activity off in it, ticking Swim back on, and a word. */
  private static ImportSetupSaves.Result importWorkbook(Camp c) {
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
      },
      new Map<String, Object>()
    );
    archery.put('who', new List<Object>());
    Map<String, Object> backOn = new Map<String, Object>{
      'kind' => 'WeekException',
      'id' => c.swimOffWeek2.Id,
      'remove' => true,
      'fields' => new Map<String, Object>()
    };
    return ImportController.saveWorkbook(
      JSON.serialize(
        plan(
          c.season.Id,
          new List<Object>{
            rec(
              'Week',
              'Week:2026-07-20',
              new Map<String, Object>{
                'Name' => 'Week 4',
                'StartDate__c' => '2026-07-20',
                'EndDate__c' => '2026-07-24'
              },
              new Map<String, Object>()
            ),
            rec(
              'Week',
              c.weeks[0].Id,
              new Map<String, Object>{
                'Name' => 'Opening week',
                'EndDate__c' => '2026-07-02'
              },
              new Map<String, Object>()
            ),
            archery,
            rec(
              'WeekException',
              'WeekException:Activity:Archery:Week:2026-07-20',
              new Map<String, Object>(),
              new Map<String, Object>{
                'Week__c' => 'Week:2026-07-20',
                'Activity__c' => 'Activity:Archery'
              }
            ),
            backOn
          },
          new List<Object>{ word('Group', 'Cabin', 'Cabins') }
        )
      )
    );
  }

  @IsTest
  static void savesTheWorkbookAllTogetherAndUndoPutsItAllBack() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      ImportSetupSaves.Result result = importWorkbook(c);
      Assert.areEqual(1, result.added.get('Week'));
      Assert.areEqual(1, result.added.get('CampLabel'));
      Week__c added = [
        SELECT Id, (SELECT Activity__r.Name FROM WeekExceptions__r)
        FROM Week__c
        WHERE Name = 'Week 4'
      ];
      Assert.areEqual('Archery', added.WeekExceptions__r[0].Activity__r.Name);
      Week__c renamed = [
        SELECT Name, EndDate__c
        FROM Week__c
        WHERE Id = :c.weeks[0].Id
      ];
      Assert.areEqual('Opening week', renamed.Name);
      Assert.areEqual(Date.newInstance(2026, 7, 2), renamed.EndDate__c);
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM WeekException__c WHERE Activity__c = :c.swim.Id]
      );
      Assert.areEqual('Cabin', CampLabels.forCamp(c.camp.Id).singular('Group'));

      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(0, [SELECT COUNT() FROM Week__c WHERE Name = 'Week 4']);
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Activity__c WHERE Name = 'Archery']
      );
      Assert.areEqual(
        'Week 1',
        [SELECT Name FROM Week__c WHERE Id = :c.weeks[0].Id].Name
      );
      // Swim is off week 2 again.
      Assert.areEqual(
        c.weeks[1].Id,
        [SELECT Week__c FROM WeekException__c WHERE Activity__c = :c.swim.Id]
        .Week__c
      );
      Assert.areEqual('Group', CampLabels.forCamp(c.camp.Id).singular('Group'));
      Assert.areEqual(
        0,
        undone.keptEdited.size(),
        String.valueOf(undone.keptEdited)
      );
    }
  }

  @IsTest
  static void aCampWordEditedSinceIsKeptAndNamed() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      insert as user new CampLabel__c(
        Camp__c = c.camp.Id,
        ModelTerm__c = 'Division',
        Singular__c = 'Unit',
        Plural__c = 'Units'
      );
      ImportSetupSaves.Result result = ImportController.saveWorkbook(
        JSON.serialize(
          plan(
            c.season.Id,
            new List<Object>(),
            new List<Object>{ word('Division', 'Village', 'Villages') }
          )
        )
      );
      CampLabel__c label = [
        SELECT Id
        FROM CampLabel__c
        WHERE ModelTerm__c = 'Division'
      ];
      label.Singular__c = 'Hamlet';
      update as user label;
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(new List<String>{ 'Hamlet' }, undone.keptEdited);
      Assert.areEqual(
        'Hamlet',
        CampLabels.forCamp(c.camp.Id).singular('Division')
      );
    }
  }

  @IsTest
  static void aScreenListCannotWriteWeeksOrWeeksOff() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      for (
        Map<String, Object> record : new List<Map<String, Object>>{
          rec(
            'Week',
            'Week:2026-07-20',
            new Map<String, Object>{
              'Name' => 'Week 4',
              'StartDate__c' => '2026-07-20',
              'EndDate__c' => '2026-07-24'
            },
            new Map<String, Object>()
          ),
          rec(
            'WeekException',
            'WeekException:x',
            new Map<String, Object>(),
            new Map<String, Object>{
              'Week__c' => c.weeks[0].Id,
              'Activity__c' => c.swim.Id
            }
          )
        }
      ) {
        try {
          ImportController.saveList(
            JSON.serialize(
              plan(c.season.Id, new List<Object>{ record }, new List<Object>())
            )
          );
          Assert.fail('refused: ' + record.get('kind'));
        } catch (AuraHandledException e) {
          Assert.isNotNull(e.getMessage());
        }
      }
      Assert.areEqual(3, [SELECT COUNT() FROM Week__c]);
    }
  }

  @IsTest
  static void aWeekCannotMoveAndAWeekOffMustBeInTheSeason() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      Season__c other = ShoreshTestData.season(c.camp.Id, 'Summer 2027');
      Week__c elsewhere = ShoreshTestData.weeks(other.Id, 1)[0];
      Activity__c far = ShoreshTestData.activity(other.Id, 'Far', null);
      insert as user far;
      WeekException__c farOff = new WeekException__c(
        Week__c = elsewhere.Id,
        Activity__c = far.Id
      );
      insert as user farOff;
      List<Object> refused = new List<Object>{
        rec(
          'Week',
          c.weeks[0].Id,
          new Map<String, Object>{ 'StartDate__c' => '2026-06-30' },
          new Map<String, Object>()
        ),
        new Map<String, Object>{
          'kind' => 'WeekException',
          'id' => farOff.Id,
          'remove' => true,
          'fields' => new Map<String, Object>()
        }
      };
      Test.startTest();
      for (Object record : refused) {
        try {
          ImportController.saveWorkbook(
            JSON.serialize(
              plan(c.season.Id, new List<Object>{ record }, new List<Object>())
            )
          );
          Assert.fail('refused: ' + JSON.serialize(record));
        } catch (AuraHandledException e) {
          Assert.isNotNull(e.getMessage());
        }
      }
      Test.stopTest();
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM WeekException__c WHERE Id = :farOff.Id]
      );
    }
  }

  /**
   * An import's record changed by hand (here in system mode: a scheduler may not be able to):
   * Undo refuses it and changes nothing.
   */
  private static void expectTamperedRefused(
    ImportSetupSaves.Result result,
    String changed,
    String created
  ) {
    Import__c done = new Import__c(Id = result.importId);
    if (changed != null) {
      done.Changed__c = changed;
    }
    if (created != null) {
      done.Created__c = created;
    }
    Database.update(done, AccessLevel.SYSTEM_MODE);
    try {
      ImportController.undoImport(result.importId);
      Assert.fail('a tampered record must be refused');
    } catch (AuraHandledException e) {
      Assert.isTrue(e.getMessage().contains('can\'t be read'), e.getMessage());
    }
    Assert.areEqual(1, [SELECT COUNT() FROM Week__c WHERE Name = 'Week 4']);
  }

  private static String changedEntry(Id recordId, String field, Object value) {
    return JSON.serialize(
      new List<Object>{
        new Map<String, Object>{
          'id' => recordId,
          'type' => 'x',
          'name' => 'x',
          'before' => new Map<String, Object>{ field => value },
          'after' => new Map<String, Object>{ field => value }
        }
      }
    );
  }

  @IsTest
  static void aTamperedRecordNamingAnotherObjectIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      ImportSetupSaves.Result result = importWorkbook(c);
      Contact someone = new Contact(LastName = 'Made Up');
      Database.insert(someone, AccessLevel.SYSTEM_MODE);
      expectTamperedRefused(
        result,
        changedEntry(someone.Id, 'Title', 'x'),
        null
      );
    }
  }

  @IsTest
  static void aTamperedRecordWithAFieldOffTheListIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      ImportSetupSaves.Result result = importWorkbook(c);
      expectTamperedRefused(
        result,
        changedEntry(c.swim.Id, 'OwnerId', UserInfo.getUserId()),
        null
      );
    }
  }

  @IsTest
  static void aTamperedRecordInjectingQueryTextIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      ImportSetupSaves.Result result = importWorkbook(c);
      Id added = [SELECT Id FROM Week__c WHERE Name = 'Week 4'].Id;
      expectTamperedRefused(
        result,
        JSON.serialize(new List<Object>()),
        JSON.serialize(
          new Map<String, Object>{
            'Week' => new Map<String, Object>{
              'fieldsets' => new List<Object>{
                new List<Object>{ 'Name FROM Contact WHERE Name != null --' }
              },
              'rows' => new List<Object>{ new List<Object>{ added, 0, 'x' } }
            }
          }
        )
      );
    }
  }
}
