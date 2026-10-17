/**
 * Slice 4c part B: the lists of what a program holds (its days, divisions, groups, time
 * blocks, fixed and recurring activities), saved all or none and undone with Undo last import.
 * Every test acts as a scheduler. Made-up camp only.
 */
@IsTest
private class ImportListProgramsTest {
  private class Camp {
    Season__c season;
    Program__c main;
    Id juniors;
    Id seniors;
    Id bunk1;
    TimeBlock__c period1;
    RecurringActivity__c meeting;
  }

  private static Camp camp() {
    Camp c = new Camp();
    c.season = ShoreshTestData.season(
      ShoreshTestData.camp('Cedar Ridge (made up)').Id,
      'Summer 2027'
    );
    c.main = ShoreshTestData.program(c.season.Id, 'Main');
    c.juniors = ShoreshTestData.division(c.main.Id, 'Juniors').Id;
    c.seniors = ShoreshTestData.division(c.main.Id, 'Seniors').Id;
    c.bunk1 = ShoreshTestData.groupIn(c.juniors, 'Bunk 1').Id;
    c.period1 = ShoreshTestData.timeBlock(c.main.Id, 'Period 1', 9);
    c.meeting = new RecurringActivity__c(
      Program__c = c.main.Id,
      Name = 'Meeting',
      TimeBlock__c = c.period1.Id,
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

  private static Map<String, Object> plan(Id seasonId, List<Object> records) {
    return new Map<String, Object>{
      'seasonId' => seasonId,
      'files' => 'list.csv',
      'records' => records,
      'remember' => new List<Object>(),
      'forget' => new List<Object>()
    };
  }

  private static Map<String, Object> rec(
    String kind,
    String keyOrId,
    Map<String, Object> fields
  ) {
    Map<String, Object> r = new Map<String, Object>{
      'kind' => kind,
      'fields' => fields
    };
    r.put(keyOrId.contains(':') ? 'key' : 'id', keyOrId);
    return r;
  }

  private static Map<String, Object> withRefs(
    Map<String, Object> r,
    Map<String, Object> refs
  ) {
    r.put('refs', refs);
    return r;
  }

  private static Map<String, Object> days(String name, List<String> runsOn) {
    Map<String, Object> fields = new Map<String, Object>();
    if (name != null) {
      fields.put('Name', name);
    }
    for (
      String day : new List<String>{
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday'
      }
    ) {
      fields.put(day + '__c', runsOn.contains(day));
    }
    return fields;
  }

  private static ImportSetupSaves.Result save(Map<String, Object> plan) {
    return ImportController.saveList(JSON.serialize(plan));
  }

  @IsTest
  static void addsAWholeNewProgramFromItsListsAndUndoRemovesIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      String teens = 'Program:Teens';
      ImportSetupSaves.Result result = save(
        plan(
          c.season.Id,
          new List<Object>{
            withRefs(
              rec(
                'Program',
                teens,
                days('Teens', new List<String>{ 'Monday', 'Wednesday' })
              ),
              new Map<String, Object>()
            ),
            withRefs(
              rec(
                'Division',
                'Division:' + teens + ':Hikers',
                new Map<String, Object>{ 'Name' => 'Hikers' }
              ),
              new Map<String, Object>{ 'Program__c' => teens }
            ),
            withRefs(
              rec(
                'Group',
                'Group:Division:' + teens + ':Hikers:Tent 1',
                new Map<String, Object>{
                  'Name' => 'Tent 1',
                  'Availability__c' => 'AllDay'
                }
              ),
              new Map<String, Object>{
                'Division__c' => 'Division:' +
                teens +
                ':Hikers'
              }
            ),
            withRefs(
              rec(
                'TimeBlock',
                'TimeBlock:' + teens + ':Trail',
                new Map<String, Object>{
                  'Name' => 'Trail',
                  'StartTime__c' => '10:00',
                  'EndTime__c' => '11:00',
                  'PartOfDay__c' => 'Morning'
                }
              ),
              new Map<String, Object>{ 'Program__c' => teens }
            ),
            withRefs(
              rec(
                'FixedActivity',
                'FixedActivity:' + teens + ':Snack',
                new Map<String, Object>{ 'Name' => 'Snack', 'Length__c' => 1 }
              ),
              new Map<String, Object>{
                'Program__c' => teens,
                'TimeBlock__c' => 'TimeBlock:' +
                teens +
                ':Trail',
                'Location__c' => null
              }
            )
          }
        )
      );
      Assert.areEqual(1, result.added.get('Program'));
      Assert.areEqual(1, result.added.get('FixedActivity'));
      Program__c added = [
        SELECT
          Monday__c,
          Tuesday__c,
          Wednesday__c,
          (SELECT Name FROM TimeBlocks__r),
          (SELECT Name FROM Divisions__r)
        FROM Program__c
        WHERE Name = 'Teens'
      ];
      Assert.isTrue(added.Monday__c && added.Wednesday__c);
      Assert.isFalse(added.Tuesday__c);
      Assert.areEqual('Trail', added.TimeBlocks__r[0].Name);
      Test.startTest();
      ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(0, [SELECT COUNT() FROM Program__c WHERE Name = 'Teens']);
    }
  }

  @IsTest
  static void changesTimesDaysAndWhoAndUndoPutsThemBack() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      ImportSetupSaves.Result result = save(
        plan(
          c.season.Id,
          new List<Object>{
            withRefs(
              rec(
                'TimeBlock',
                c.period1.Id,
                new Map<String, Object>{
                  'StartTime__c' => '09:15',
                  'EndTime__c' => '10:00'
                }
              ),
              new Map<String, Object>()
            ),
            new Map<String, Object>{
              'kind' => 'RecurringActivity',
              'id' => c.meeting.Id,
              'fields' => days(null, new List<String>{ 'Monday', 'Wednesday' }),
              'refs' => new Map<String, Object>(),
              'who' => new List<Object>{ c.seniors }
            }
          }
        )
      );
      RecurringActivity__c changed = [
        SELECT Wednesday__c, (SELECT Division__c FROM Coverages__r)
        FROM RecurringActivity__c
        WHERE Id = :c.meeting.Id
      ];
      Assert.isTrue(changed.Wednesday__c);
      Assert.areEqual(c.seniors, changed.Coverages__r[0].Division__c);
      Assert.areEqual(
        Time.newInstance(9, 15, 0, 0),
        [SELECT StartTime__c FROM TimeBlock__c WHERE Id = :c.period1.Id]
        .StartTime__c
      );
      Test.startTest();
      ImportController.undoImport(result.importId);
      Test.stopTest();
      RecurringActivity__c back = [
        SELECT Wednesday__c, (SELECT Division__c FROM Coverages__r)
        FROM RecurringActivity__c
        WHERE Id = :c.meeting.Id
      ];
      Assert.isFalse(back.Wednesday__c);
      Assert.areEqual(1, back.Coverages__r.size());
      Assert.areEqual(c.juniors, back.Coverages__r[0].Division__c);
      Assert.areEqual(
        Time.newInstance(9, 0, 0, 0),
        [SELECT StartTime__c FROM TimeBlock__c WHERE Id = :c.period1.Id]
        .StartTime__c
      );
    }
  }

  @IsTest
  static void aGroupMovesWithinItsProgramOnlyAndNeverChangesProgram() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      save(
        plan(
          c.season.Id,
          new List<Object>{
            withRefs(
              rec('Group', c.bunk1, new Map<String, Object>()),
              new Map<String, Object>{ 'Division__c' => c.seniors }
            )
          }
        )
      );
      Assert.areEqual(
        c.seniors,
        [SELECT Division__c FROM Group__c WHERE Id = :c.bunk1].Division__c
      );
      Program__c other = ShoreshTestData.program(c.season.Id, 'Other');
      Id elsewhere = ShoreshTestData.division(other.Id, 'Elsewhere').Id;
      Test.startTest();
      List<Map<String, Object>> refused = new List<Map<String, Object>>{
        withRefs(
          rec('Group', c.bunk1, new Map<String, Object>()),
          new Map<String, Object>{ 'Division__c' => elsewhere }
        ),
        withRefs(
          rec('TimeBlock', c.period1.Id, new Map<String, Object>()),
          new Map<String, Object>{ 'Program__c' => other.Id }
        )
      };
      for (Map<String, Object> attempt : refused) {
        try {
          save(plan(c.season.Id, new List<Object>{ attempt }));
          Assert.fail('refused: ' + JSON.serialize(attempt));
        } catch (AuraHandledException e) {
          Assert.isNotNull(e.getMessage());
        }
      }
      Test.stopTest();
      Assert.areEqual(
        c.seniors,
        [SELECT Division__c FROM Group__c WHERE Id = :c.bunk1].Division__c
      );
    }
  }

  @IsTest
  static void undoPutsAMovedGroupBack() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      ImportSetupSaves.Result moved = save(
        plan(
          c.season.Id,
          new List<Object>{
            withRefs(
              rec(
                'Group',
                c.bunk1,
                new Map<String, Object>{ 'Availability__c' => 'AllDay' }
              ),
              new Map<String, Object>{ 'Division__c' => c.seniors }
            )
          }
        )
      );
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(moved.importId);
      Test.stopTest();
      Group__c back = [
        SELECT Division__c, Availability__c
        FROM Group__c
        WHERE Id = :c.bunk1
      ];
      Assert.areEqual(c.juniors, back.Division__c);
      Assert.areEqual('MorningOnly', back.Availability__c);
      Assert.areEqual(1, undone.restored);
    }
  }

  private static Map<String, Object> newRecurring(Camp c, String name, Id who) {
    Map<String, Object> fields = days(name, new List<String>{ 'Monday' });
    fields.put('Length__c', 1);
    Map<String, Object> r = withRefs(
      rec(
        'RecurringActivity',
        'RecurringActivity:' + c.main.Id + ':' + name,
        fields
      ),
      new Map<String, Object>{
        'Program__c' => c.main.Id,
        'TimeBlock__c' => c.period1.Id,
        'Location__c' => null
      }
    );
    r.put('who', new List<Object>{ who });
    return r;
  }

  // Coordinator, #20 review: Undo decides to keep an edited recurring activity before it
  // removes the Coverage rows the import made, so the activity keeps who it covers.
  @IsTest
  static void undoKeepsAnEditedRecurringActivityWithWhoItCovers() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      // Room for a Length of 2.
      ShoreshTestData.timeBlock(c.main.Id, 'Period 2', 10);
      ImportSetupSaves.Result result = save(
        plan(
          c.season.Id,
          new List<Object>{ newRecurring(c, 'Flag', c.seniors) }
        )
      );
      RecurringActivity__c flag = [
        SELECT Id, Length__c
        FROM RecurringActivity__c
        WHERE Name = 'Flag'
      ];
      flag.Length__c = 2;
      update as user flag;
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.isTrue(
        undone.keptEdited.contains('Flag'),
        String.valueOf(undone.keptEdited)
      );
      List<Coverage__c> cover = [
        SELECT Division__c
        FROM Coverage__c
        WHERE RecurringActivity__c = :flag.Id
      ];
      Assert.areEqual(1, cover.size(), 'Flag still covers only Seniors');
      Assert.areEqual(c.seniors, cover[0].Division__c);
    }
  }

  // Coordinator, #20 review: an import that would make a clash is refused whole, naming both.
  @IsTest
  static void anImportThatMakesAClashIsRefusedWholeNamingBoth() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      Map<String, Object> rest = withRefs(
        rec(
          'TimeBlock',
          'TimeBlock:' + c.main.Id + ':Rest',
          new Map<String, Object>{
            'Name' => 'Rest',
            'StartTime__c' => '13:00',
            'EndTime__c' => '13:30',
            'PartOfDay__c' => 'Afternoon'
          }
        ),
        new Map<String, Object>{ 'Program__c' => c.main.Id }
      );
      Map<String, Object> lunch = withRefs(
        rec(
          'FixedActivity',
          'FixedActivity:' + c.main.Id + ':Lunch',
          new Map<String, Object>{ 'Name' => 'Lunch', 'Length__c' => 1 }
        ),
        new Map<String, Object>{
          'Program__c' => c.main.Id,
          'TimeBlock__c' => c.period1.Id,
          'Location__c' => null
        }
      );
      Test.startTest();
      // Meeting covers Juniors on Monday in Period 1.
      for (
        Map<String, Object> clash : new List<Map<String, Object>>{
          newRecurring(c, 'Flag', c.juniors),
          lunch
        }
      ) {
        String name = (String) ((Map<String, Object>) clash.get('fields'))
          .get('Name');
        try {
          save(plan(c.season.Id, new List<Object>{ rest, clash }));
          Assert.fail('a clash must be refused: ' + name);
        } catch (AuraHandledException e) {
          Assert.isTrue(
            e.getMessage().contains('"Meeting"') &&
            e.getMessage().contains('"' + name + '"'),
            e.getMessage()
          );
        }
      }
      Test.stopTest();
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM TimeBlock__c
          WHERE Name = 'Rest'
        ],
        'nothing is kept'
      );
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM RecurringActivity__c],
        'only Meeting'
      );
      Assert.areEqual(0, [SELECT COUNT() FROM FixedActivity__c]);
    }
  }
}
