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

  private static Map<String, Object> linked(
    Map<String, Object> record,
    Map<String, Object> refs
  ) {
    record.put('refs', refs);
    return record;
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
      }
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
            linked(
              rec(
                'WeekException',
                'WeekException:Activity:Archery:Week:2026-07-20',
                new Map<String, Object>()
              ),
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

  /** An item edited since keeps the weeks it is off, and so does the week they are in. */
  @IsTest
  static void anItemEditedSinceKeepsItsWeeksOff() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      ImportSetupSaves.Result result = importWorkbook(c);
      Activity__c archery = [SELECT Id FROM Activity__c WHERE Name = 'Archery'];
      archery.Name = 'Archery range';
      update as user archery;
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(new List<String>{ 'Archery range' }, undone.keptEdited);
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM WeekException__c WHERE Activity__c = :archery.Id]
      );
      Assert.areEqual(1, [SELECT COUNT() FROM Week__c WHERE Name = 'Week 4']);
      Assert.isTrue(
        undone.keptInUse.contains('Week 4'),
        String.valueOf(undone.keptInUse)
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
            }
          ),
          linked(
            rec('WeekException', 'WeekException:x', new Map<String, Object>()),
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
          new Map<String, Object>{ 'StartDate__c' => '2026-06-30' }
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
      Assert.isNotNull(result.importId);
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
      Assert.isNotNull(result.importId);
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
      Assert.isNotNull(result.importId);
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

  /** A made-up kind, or a kind holding another object's record, would count as made by it. */
  @IsTest
  static void aTamperedRecordWithAnotherKindOrRecordIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      ImportSetupSaves.Result result = importWorkbook(c);
      Contact someone = new Contact(LastName = 'Made Up');
      Database.insert(someone, AccessLevel.SYSTEM_MODE);
      Assert.isNotNull(result.importId);
      expectTamperedRefused(
        result,
        JSON.serialize(new List<Object>()),
        createdOf('Contact', someone.Id)
      );
      expectTamperedRefused(
        result,
        JSON.serialize(new List<Object>()),
        createdOf('Week', someone.Id)
      );
    }
  }

  private static String createdOf(String term, Id recordId) {
    return JSON.serialize(
      new Map<String, Object>{
        term => new Map<String, Object>{
          'fieldsets' => new List<Object>{ new List<Object>{ 'Name' } },
          'rows' => new List<Object>{ new List<Object>{ recordId, 0, 'x' } }
        }
      }
    );
  }

  /** A week to put back with a target that isn't an Id, or that names the week as the item. */
  @IsTest
  static void aTamperedWeekToPutBackIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      ImportSetupSaves.Result result = importWorkbook(c);
      Assert.isNotNull(result.importId);
      expectTamperedRefused(
        result,
        weekOn(c, 'Activity__c', 'not an id'),
        null
      );
      expectTamperedRefused(result, weekOn(c, 'Week__c', c.weeks[0].Id), null);
    }
  }

  private static String weekOn(Camp c, String field, Object target) {
    return JSON.serialize(
      new List<Object>{
        new Map<String, Object>{
          'weekOn' => c.swimOffWeek2.Id,
          'week' => c.weeks[1].Id,
          'field' => field,
          'target' => target,
          'name' => 'Week 2',
          'item' => 'Swim'
        }
      }
    );
  }

  // ---- Coordinator's review, round 1 ----

  /** A season with dates (Jun 29 to Aug 7 2026: six weeks) and no weeks yet. */
  private static Season__c emptySeason() {
    Camp__c camp = ShoreshTestData.camp('Birch Hollow (made up)');
    return ShoreshTestData.season(camp.Id, 'Summer 2026');
  }

  private static List<Object> fill(List<String> names) {
    List<Object> result = new List<Object>();
    Date monday = Date.newInstance(2026, 6, 29);
    for (Integer i = 0; i < names.size(); i++) {
      result.add(
        new Map<String, Object>{
          'start' => String.valueOf(monday.addDays(7 * i)),
          'name' => names[i]
        }
      );
    }
    return result;
  }

  private static ImportSetupSaves.Result importFilling(
    Id seasonId,
    List<Object> fillWeeks,
    List<Object> records
  ) {
    Map<String, Object> p = plan(seasonId, records, new List<Object>());
    p.put('fillWeeks', fillWeeks);
    return ImportController.saveWorkbook(JSON.serialize(p));
  }

  @IsTest
  static void anotherSeasonsWorkbookFillsAnEmptySeasonsWeeksAndUndoRemovesThem() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = emptySeason();
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
      ImportSetupSaves.Result result = importFilling(
        season.Id,
        fill(
          new List<String>{
            'Opening week',
            'Week 2',
            'Week 3',
            'Week 4',
            'Week 5',
            'Week 6'
          }
        ),
        new List<Object>{
          archery,
          // Runs in, paired by order onto a week this save fills in.
          linked(
            rec(
              'WeekException',
              'WeekException:Activity:Archery:Week:2026-07-06',
              new Map<String, Object>()
            ),
            new Map<String, Object>{
              'Week__c' => 'Week:2026-07-06',
              'Activity__c' => 'Activity:Archery'
            }
          )
        }
      );
      Assert.areEqual(6, result.added.get('Week'));
      List<Week__c> weeks = [
        SELECT
          Name,
          StartDate__c,
          EndDate__c,
          SortOrder__c,
          (SELECT Activity__r.Name FROM WeekExceptions__r)
        FROM Week__c
        WHERE Season__c = :season.Id
        ORDER BY StartDate__c
      ];
      Assert.areEqual(6, weeks.size());
      Assert.areEqual('Opening week', weeks[0].Name);
      Assert.areEqual(Date.newInstance(2026, 7, 3), weeks[0].EndDate__c);
      Assert.areEqual(1, weeks[0].SortOrder__c);
      Assert.areEqual(
        'Archery',
        weeks[1].WeekExceptions__r[0].Activity__r.Name
      );

      // One week renamed since: Undo keeps it, and removes the rest.
      weeks[5].Name = 'Closing week';
      update as user weeks[5];
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(new List<String>{ 'Closing week' }, undone.keptEdited);
      Assert.areEqual(
        new List<String>{ 'Closing week' },
        new List<String>{
          [SELECT Name FROM Week__c WHERE Season__c = :season.Id]
          .Name
        }
      );
    }
  }

  @IsTest
  static void weeksToFillThatNoLongerMatchTheSeasonsDatesAreRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = emptySeason();
      try {
        importFilling(
          season.Id,
          fill(new List<String>{ 'Week 1', 'Week 2' }),
          new List<Object>()
        );
        Assert.fail(
          'weeks that differ from the season\'s dates must be refused'
        );
      } catch (AuraHandledException e) {
        Assert.isTrue(e.getMessage().contains('dates changed'), e.getMessage());
      }
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Week__c WHERE Season__c = :season.Id]
      );
    }
  }

  @IsTest
  static void aWeekOffThatCantBePutBackIsNamedByItemAndWeek() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      ImportSetupSaves.Result result = importWorkbook(c);
      delete as user new Activity__c(Id = c.swim.Id);
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(new List<String>{ 'Swim (Week 2)' }, undone.gone);
    }
  }

  @IsTest
  static void aWeekOffToPutBackInAnotherSeasonOrWithoutAnItemNameIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      ImportSetupSaves.Result result = importWorkbook(c);
      Season__c other = ShoreshTestData.season(c.camp.Id, 'Summer 2027');
      Week__c elsewhere = ShoreshTestData.weeks(other.Id, 1)[0];
      Assert.isNotNull(result.importId);
      Map<String, Object> entry = (Map<String, Object>) ((List<Object>) JSON.deserializeUntyped(
        weekOn(c, 'Activity__c', c.swim.Id)
      ))[0];
      entry.put('week', elsewhere.Id);
      expectTamperedRefused(
        result,
        JSON.serialize(new List<Object>{ entry }),
        null
      );
      entry.put('week', c.weeks[1].Id);
      entry.put('item', 5);
      expectTamperedRefused(
        result,
        JSON.serialize(new List<Object>{ entry }),
        null
      );
    }
  }

  @IsTest
  static void shoreshsOwnWordIsNoCampWordAndUndoPutsTheCampsBack() {
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
            new List<Object>{
              word('Division', 'Division', 'Divisions'),
              word('Group', 'Group', 'Groups')
            }
          )
        )
      );
      // Unit is gone, and Group (no camp word before) gets none.
      Assert.areEqual(0, [SELECT COUNT() FROM CampLabel__c]);
      Assert.isNull(result.added.get('CampLabel'));
      Assert.areEqual(1, result.changed.get('CampLabel'));
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(1, undone.restored);
      Assert.areEqual(
        'Unit',
        CampLabels.forCamp(c.camp.Id).singular('Division')
      );
    }
  }

  @IsTest
  static void aCampWordChosenAgainSinceIsKeptWhenUndoWouldPutOneBack() {
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
            new List<Object>{ word('Division', 'Division', 'Divisions') }
          )
        )
      );
      insert as user new CampLabel__c(
        Camp__c = c.camp.Id,
        ModelTerm__c = 'Division',
        Singular__c = 'Village',
        Plural__c = 'Villages'
      );
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(new List<String>{ 'Village' }, undone.keptEdited);
      Assert.areEqual(
        'Village',
        CampLabels.forCamp(c.camp.Id).singular('Division')
      );
    }
  }
}
