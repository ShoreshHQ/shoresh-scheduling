/**
 * Slice 4c: a setup list imported on a screen, saved all or none and undone with Undo last
 * import. Every test acts as a scheduler. Made-up camp only.
 */
@IsTest
private class ImportListSavesTest {
  private class Camp {
    Season__c season;
    Id juniors;
    Id seniors;
    Id bunk1;
    Location__c gym;
    Activity__c archery;
  }

  private static Camp camp() {
    Camp c = new Camp();
    Camp__c record = ShoreshTestData.camp('Pine Hollow (made up)');
    c.season = ShoreshTestData.season(record.Id, 'Summer 2027');
    Program__c program = ShoreshTestData.program(c.season.Id, 'Main');
    c.juniors = ShoreshTestData.division(program.Id, 'Juniors').Id;
    c.seniors = ShoreshTestData.division(program.Id, 'Seniors').Id;
    c.bunk1 = ShoreshTestData.groupIn(c.juniors, 'Bunk 1').Id;
    c.gym = new Location__c(
      Season__c = c.season.Id,
      Name = 'Gym',
      GroupsThatFit__c = 2
    );
    insert as user c.gym;
    c.archery = ShoreshTestData.activity(c.season.Id, 'Archery', c.gym.Id);
    insert as user c.archery;
    insert as user new ActivityEligibility__c(
      Activity__c = c.archery.Id,
      Division__c = c.juniors
    );
    return c;
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

  private static Map<String, Object> newActivity(
    String name,
    Map<String, Object> refs,
    List<Object> who
  ) {
    return new Map<String, Object>{
      'kind' => 'Activity',
      'key' => 'Activity:' + name,
      'fields' => new Map<String, Object>{
        'Name' => name,
        'Length__c' => 1,
        'TimesPerWeekMin__c' => 2,
        'TimesPerWeekMax__c' => 3,
        'NoWeeklyMax__c' => false,
        'Priority__c' => 'High',
        'Outdoor__c' => true,
        'GroupsAtOnce__c' => 1,
        'NoGroupLimit__c' => false
      },
      'refs' => refs,
      'who' => who
    };
  }

  private static ImportSetupSaves.Result save(Map<String, Object> plan) {
    return ImportController.saveList(JSON.serialize(plan));
  }

  @IsTest
  static void addsActivitiesWithANewLocationWhoAndARainPlanInTheSameList() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      Test.startTest();
      ImportSetupSaves.Result result = save(
        plan(
          c.season.Id,
          new List<Object>{
            new Map<String, Object>{
              'kind' => 'Location',
              'key' => 'Location:Lake',
              'fields' => new Map<String, Object>{
                'Name' => 'Lake',
                'GroupsThatFit__c' => 1
              }
            },
            newActivity(
              'Canoeing',
              new Map<String, Object>{
                'Location__c' => 'Location:Lake',
                'RainPlan__c' => 'Activity:Board games'
              },
              new List<Object>{ c.seniors, c.bunk1 }
            ),
            newActivity(
              'Board games',
              new Map<String, Object>{ 'Location__c' => c.gym.Id },
              new List<Object>()
            )
          }
        )
      );
      Test.stopTest();
      Assert.areEqual(2, result.added.get('Activity'));
      Assert.areEqual(1, result.added.get('Location'));
      Assert.isNotNull(result.importId);
      Activity__c canoeing = [
        SELECT
          Location__r.Name,
          RainPlan__r.Name,
          Outdoor__c,
          Priority__c,
          (SELECT Division__c, Group__c FROM Eligibilities__r)
        FROM Activity__c
        WHERE Name = 'Canoeing'
      ];
      Assert.areEqual('Lake', canoeing.Location__r.Name);
      Assert.areEqual('Board games', canoeing.RainPlan__r.Name);
      Assert.isTrue(canoeing.Outdoor__c);
      Assert.areEqual(2, canoeing.Eligibilities__r.size());
      Import__c done = [
        SELECT Files__c
        FROM Import__c
        WHERE Id = :result.importId
      ];
      Assert.areEqual('activities.csv (Activities)', done.Files__c);
    }
  }

  @IsTest
  static void undoRemovesWhatTheListAddedEvenWithALinkBetweenThem() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      ImportSetupSaves.Result result = save(
        plan(
          c.season.Id,
          new List<Object>{
            newActivity(
              'Canoeing',
              new Map<String, Object>{
                'RainPlan__c' => 'Activity:Board games'
              },
              new List<Object>{ c.seniors }
            ),
            newActivity(
              'Board games',
              new Map<String, Object>(),
              new List<Object>()
            )
          }
        )
      );
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Activity__c WHERE Name IN ('Canoeing', 'Board games')]
      );
      Assert.areEqual(0, undone.keptEdited.size(), 'the rain plan is the import\'s own');
    }
  }

  @IsTest
  static void changesOnlyTheChosenFieldsAndUndoPutsThemAndWhoBack() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      ImportSetupSaves.Result result = save(
        plan(
          c.season.Id,
          new List<Object>{
            new Map<String, Object>{
              'kind' => 'Activity',
              'id' => c.archery.Id,
              'fields' => new Map<String, Object>{
                'TimesPerWeekMin__c' => 2,
                'NoWeeklyMax__c' => true,
                'TimesPerWeekMax__c' => null
              },
              'refs' => new Map<String, Object>{ 'Location__c' => null },
              'who' => new List<Object>{ c.seniors, c.bunk1 }
            }
          }
        )
      );
      Assert.areEqual(1, result.changed.get('Activity'));
      Activity__c changed = [
        SELECT
          TimesPerWeekMin__c,
          NoWeeklyMax__c,
          Location__c,
          Priority__c,
          (SELECT Division__c, Group__c FROM Eligibilities__r)
        FROM Activity__c
        WHERE Id = :c.archery.Id
      ];
      Assert.areEqual(2, changed.TimesPerWeekMin__c);
      Assert.isTrue(changed.NoWeeklyMax__c);
      Assert.isNull(changed.Location__c);
      Assert.areEqual('Low', changed.Priority__c, 'not sent, not changed');
      Assert.areEqual(2, changed.Eligibilities__r.size());

      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Activity__c back = [
        SELECT
          TimesPerWeekMin__c,
          TimesPerWeekMax__c,
          NoWeeklyMax__c,
          Location__c,
          (SELECT Division__c FROM Eligibilities__r)
        FROM Activity__c
        WHERE Id = :c.archery.Id
      ];
      Assert.areEqual(1, back.TimesPerWeekMin__c);
      Assert.areEqual(2, back.TimesPerWeekMax__c);
      Assert.isFalse(back.NoWeeklyMax__c);
      Assert.areEqual(c.gym.Id, back.Location__c);
      Assert.areEqual(1, back.Eligibilities__r.size());
      Assert.areEqual(c.juniors, back.Eligibilities__r[0].Division__c);
      Assert.areEqual(2, undone.restored);
    }
  }

  @IsTest
  static void undoKeepsAWhoListEditedSince() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      ImportSetupSaves.Result result = save(
        plan(
          c.season.Id,
          new List<Object>{
            new Map<String, Object>{
              'kind' => 'Activity',
              'id' => c.archery.Id,
              'fields' => new Map<String, Object>(),
              'refs' => new Map<String, Object>(),
              'who' => new List<Object>{ c.seniors }
            }
          }
        )
      );
      insert as user new ActivityEligibility__c(
        Activity__c = c.archery.Id,
        Group__c = c.bunk1
      );
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(new List<String>{ 'Archery' }, undone.keptEdited);
      Assert.areEqual(
        2,
        [SELECT COUNT() FROM ActivityEligibility__c WHERE Activity__c = :c.archery.Id]
      );
    }
  }

  @IsTest
  static void aNewLocationTypeIsUndoneButOneALocationWasGivenSinceIsKept() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      ImportSetupSaves.Result result = save(
        new Map<String, Object>{
          'seasonId' => c.season.Id,
          'files' => 'locations.csv',
          'records' => new List<Object>{
            new Map<String, Object>{
              'kind' => 'LocationType',
              'key' => 'LocationType:Indoors',
              'fields' => new Map<String, Object>{ 'Name' => 'Indoors' }
            },
            new Map<String, Object>{
              'kind' => 'Location',
              'key' => 'Location:Barn',
              'fields' => new Map<String, Object>{
                'Name' => 'Barn',
                'GroupsThatFit__c' => 2
              },
              'refs' => new Map<String, Object>{
                'LocationType__c' => 'LocationType:Indoors'
              }
            }
          }
        }
      );
      Id indoors = [SELECT Id FROM LocationType__c WHERE Name = 'Indoors'].Id;
      c.gym.LocationType__c = indoors;
      update as user c.gym;
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(0, [SELECT COUNT() FROM Location__c WHERE Name = 'Barn']);
      Assert.areEqual(new List<String>{ 'Indoors' }, undone.keptInUse);
    }
  }

  @IsTest
  static void allOrNone() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      Map<String, Object> bad = newActivity(
        'Canoeing',
        new Map<String, Object>(),
        new List<Object>()
      );
      ((Map<String, Object>) bad.get('fields')).put('Length__c', 0);
      Test.startTest();
      try {
        save(
          plan(
            c.season.Id,
            new List<Object>{
              newActivity('Hiking', new Map<String, Object>(), new List<Object>()),
              bad
            }
          )
        );
        Assert.fail('a refused row stops the whole list');
      } catch (AuraHandledException e) {
        Assert.isTrue(e.getMessage().contains('Canoeing'), e.getMessage());
      }
      Test.stopTest();
      Assert.areEqual(0, [SELECT COUNT() FROM Activity__c WHERE Name = 'Hiking']);
      Assert.areEqual(0, [SELECT COUNT() FROM Import__c]);
    }
  }

  @IsTest
  static void refusesRecordsOfAnotherSeasonAndFieldsAListCannotWrite() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      Season__c other = ShoreshTestData.season(
        ShoreshTestData.camp('Other (made up)').Id,
        'Elsewhere'
      );
      Activity__c theirs = ShoreshTestData.activity(other.Id, 'Theirs', null);
      insert as user theirs;
      Test.startTest();
      List<Map<String, Object>> attempts = new List<Map<String, Object>>{
        new Map<String, Object>{
          'kind' => 'Activity',
          'id' => theirs.Id,
          'fields' => new Map<String, Object>{ 'Length__c' => 2 }
        },
        new Map<String, Object>{
          'kind' => 'Activity',
          'id' => c.archery.Id,
          'fields' => new Map<String, Object>{ 'Season__c' => other.Id }
        },
        new Map<String, Object>{
          'kind' => 'Season',
          'id' => c.season.Id,
          'fields' => new Map<String, Object>{ 'Name' => 'x' }
        }
      };
      for (Map<String, Object> attempt : attempts) {
        try {
          save(plan(c.season.Id, new List<Object>{ attempt }));
          Assert.fail('refused: ' + JSON.serialize(attempt));
        } catch (AuraHandledException e) {
          Assert.isTrue(e.getMessage().contains('Start it again'), e.getMessage());
        }
      }
      Test.stopTest();
      Assert.areEqual(1, [SELECT Length__c FROM Activity__c WHERE Id = :theirs.Id].Length__c);
    }
  }

  @IsTest
  static void changingWhoForSixtyActivitiesFitsInTheUndoLog() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      List<Group__c> bunks = new List<Group__c>();
      for (Integer i = 2; i <= 11; i++) {
        bunks.add(
          new Group__c(
            Division__c = i <= 6 ? c.juniors : c.seniors,
            Name = 'Bunk ' + i,
            Availability__c = 'AllDay'
          )
        );
      }
      insert as user bunks;
      List<Activity__c> activities = new List<Activity__c>();
      for (Integer i = 0; i < 60; i++) {
        activities.add(
          ShoreshTestData.activity(c.season.Id, 'Activity ' + i, null)
        );
      }
      insert as user activities;
      List<ActivityEligibility__c> who = new List<ActivityEligibility__c>();
      for (Activity__c activity : activities) {
        for (Integer g = 0; g < 5; g++) {
          who.add(
            new ActivityEligibility__c(
              Activity__c = activity.Id,
              Group__c = bunks[g].Id
            )
          );
        }
      }
      insert as user who;
      List<Object> records = new List<Object>();
      for (Activity__c activity : activities) {
        List<Object> after = new List<Object>();
        for (Integer g = 5; g < 10; g++) {
          after.add(bunks[g].Id);
        }
        records.add(
          new Map<String, Object>{
            'kind' => 'Activity',
            'id' => activity.Id,
            'fields' => new Map<String, Object>{ 'Priority__c' => 'High' },
            'who' => after
          }
        );
      }
      Test.startTest();
      ImportSetupSaves.Result result = save(plan(c.season.Id, records));
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(60, result.changed.get('Activity'));
      Assert.areEqual(120, undone.restored);
      List<Id> firstFive = new List<Id>();
      for (Integer g = 0; g < 5; g++) {
        firstFive.add(bunks[g].Id);
      }
      Assert.areEqual(
        300,
        [SELECT COUNT() FROM ActivityEligibility__c WHERE Group__c IN :firstFive],
        'every list is back as it was'
      );
    }
  }
}
