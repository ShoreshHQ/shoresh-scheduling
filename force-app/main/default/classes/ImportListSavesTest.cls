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
    Id scheduler;
  }

  // The camp is built once for the class (setup) and read back in each test (camp()).
  @TestSetup
  static void setup() {
    User scheduler = ShoreshTestData.scheduler();
    Camp c;
    System.runAs(scheduler) {
      c = new Camp();
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
    }
    KeptCamp.keepIds(
      new Map<String, Id>{
        'Season' => c.season.Id,
        'Juniors' => c.juniors,
        'Seniors' => c.seniors,
        'Bunk 1' => c.bunk1,
        'Gym' => c.gym.Id,
        'Archery' => c.archery.Id,
        'Scheduler' => scheduler.Id
      }
    );
  }

  /** The camp setup built. */
  private static Camp camp() {
    Map<String, Id> ids = KeptCamp.keptIds();
    Camp c = new Camp();
    c.season = new Season__c(Id = ids.get('Season'));
    c.juniors = ids.get('Juniors');
    c.seniors = ids.get('Seniors');
    c.bunk1 = ids.get('Bunk 1');
    c.gym = new Location__c(Id = ids.get('Gym'));
    c.archery = new Activity__c(Id = ids.get('Archery'));
    c.scheduler = ids.get('Scheduler');
    return c;
  }

  @IsTest
  static void addsActivitiesWithANewLocationWhoAndARainPlanInTheSameList() {
    Camp c = camp();
    System.runAs(new User(Id = c.scheduler)) {
      Test.startTest();
      ImportSetupSaves.Result result = ImportController.saveList(
        JSON.serialize(
          ImportTestPlans.listPlan(
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
              ImportTestPlans.newActivity(
                'Canoeing',
                new Map<String, Object>{
                  'Location__c' => 'Location:Lake',
                  'RainPlan__c' => 'Activity:Board games'
                },
                new List<Object>{ c.seniors, c.bunk1 }
              ),
              ImportTestPlans.newActivity(
                'Board games',
                new Map<String, Object>{ 'Location__c' => c.gym.Id },
                new List<Object>()
              )
            }
          )
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
    Camp c = camp();
    System.runAs(new User(Id = c.scheduler)) {
      ImportSetupSaves.Result result = ImportController.saveList(
        JSON.serialize(
          ImportTestPlans.listPlan(
            c.season.Id,
            new List<Object>{
              ImportTestPlans.newActivity(
                'Canoeing',
                new Map<String, Object>{
                  'RainPlan__c' => 'Activity:Board games'
                },
                new List<Object>{ c.seniors }
              ),
              ImportTestPlans.newActivity(
                'Board games',
                new Map<String, Object>(),
                new List<Object>()
              )
            }
          )
        )
      );
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Activity__c
          WHERE Name IN ('Canoeing', 'Board games')
        ]
      );
      Assert.areEqual(
        0,
        undone.keptEdited.size(),
        'the rain plan is the import\'s own'
      );
    }
  }

  @IsTest
  static void changesOnlyTheChosenFieldsAndUndoPutsThemAndWhoBack() {
    Camp c = camp();
    System.runAs(new User(Id = c.scheduler)) {
      ImportSetupSaves.Result result = ImportController.saveList(
        JSON.serialize(
          ImportTestPlans.listPlan(
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
    Camp c = camp();
    System.runAs(new User(Id = c.scheduler)) {
      ImportSetupSaves.Result result = ImportController.saveList(
        JSON.serialize(
          ImportTestPlans.listPlan(
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
        [
          SELECT COUNT()
          FROM ActivityEligibility__c
          WHERE Activity__c = :c.archery.Id
        ]
      );
    }
  }

  @IsTest
  static void aNewLocationTypeIsUndoneButOneALocationWasGivenSinceIsKept() {
    Camp c = camp();
    System.runAs(new User(Id = c.scheduler)) {
      ImportSetupSaves.Result result = ImportController.saveList(
        JSON.serialize(
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
        )
      );
      Id indoors = [SELECT Id FROM LocationType__c WHERE Name = 'Indoors'].Id;
      update as user new Location__c(Id = c.gym.Id, LocationType__c = indoors);
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(0, [SELECT COUNT() FROM Location__c WHERE Name = 'Barn']);
      Assert.areEqual(new List<String>{ 'Indoors' }, undone.keptInUse);
    }
  }

  @IsTest
  static void allOrNone() {
    Camp c = camp();
    System.runAs(new User(Id = c.scheduler)) {
      Map<String, Object> bad = ImportTestPlans.newActivity(
        'Canoeing',
        new Map<String, Object>(),
        new List<Object>()
      );
      ((Map<String, Object>) bad.get('fields')).put('Length__c', 0);
      Test.startTest();
      try {
        ImportController.saveList(
          JSON.serialize(
            ImportTestPlans.listPlan(
              c.season.Id,
              new List<Object>{
                ImportTestPlans.newActivity(
                  'Hiking',
                  new Map<String, Object>(),
                  new List<Object>()
                ),
                bad
              }
            )
          )
        );
        Assert.fail('a refused row stops the whole list');
      } catch (AuraHandledException e) {
        Assert.isTrue(e.getMessage().contains('Canoeing'), e.getMessage());
      }
      Test.stopTest();
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Activity__c WHERE Name = 'Hiking']
      );
      Assert.areEqual(0, [SELECT COUNT() FROM Import__c]);
    }
  }

  @IsTest
  static void refusesRecordsOfAnotherSeasonAndFieldsAListCannotWrite() {
    Camp c = camp();
    System.runAs(new User(Id = c.scheduler)) {
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
          ImportController.saveList(
            JSON.serialize(
              ImportTestPlans.listPlan(c.season.Id, new List<Object>{ attempt })
            )
          );
          Assert.fail('refused: ' + JSON.serialize(attempt));
        } catch (AuraHandledException e) {
          Assert.isTrue(
            e.getMessage().contains('Start it again'),
            e.getMessage()
          );
        }
      }
      Test.stopTest();
      Assert.areEqual(
        1,
        [SELECT Length__c FROM Activity__c WHERE Id = :theirs.Id].Length__c
      );
    }
  }

  @IsTest
  static void changingWhoForSixtyActivitiesFitsInTheUndoLog() {
    Camp c = camp();
    System.runAs(new User(Id = c.scheduler)) {
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
      ImportSetupSaves.Result result = ImportController.saveList(
        JSON.serialize(ImportTestPlans.listPlan(c.season.Id, records))
      );
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
        [
          SELECT COUNT()
          FROM ActivityEligibility__c
          WHERE Group__c IN :firstFive
        ],
        'every list is back as it was'
      );
    }
  }

  @IsTest
  static void addsAGroupNamedInWhoCanDoItAndUndoRemovesIt() {
    Camp c = camp();
    System.runAs(new User(Id = c.scheduler)) {
      String key = 'Group:' + c.seniors + ':Middlers';
      ImportSetupSaves.Result result = ImportController.saveList(
        JSON.serialize(
          ImportTestPlans.listPlan(
            c.season.Id,
            new List<Object>{
              new Map<String, Object>{
                'kind' => 'Group',
                'key' => key,
                'fields' => new Map<String, Object>{
                  'Name' => 'Middlers',
                  'Availability__c' => 'AllDay'
                },
                'refs' => new Map<String, Object>{ 'Division__c' => c.seniors }
              },
              ImportTestPlans.newActivity(
                'Pottery',
                new Map<String, Object>(),
                new List<Object>{ key }
              )
            }
          )
        )
      );
      Group__c middlers = [
        SELECT Id, Division__c
        FROM Group__c
        WHERE Name = 'Middlers'
      ];
      Assert.areEqual(c.seniors, middlers.Division__c);
      Assert.areEqual(
        middlers.Id,
        [
          SELECT Group__c
          FROM ActivityEligibility__c
          WHERE Activity__r.Name = 'Pottery'
        ]
        .Group__c
      );
      Test.startTest();
      ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Group__c WHERE Name = 'Middlers']
      );
    }
  }

  @IsTest
  static void aRainPlanChangedToAnActivityTheListAddsIsUndone() {
    Camp c = camp();
    System.runAs(new User(Id = c.scheduler)) {
      ImportSetupSaves.Result result = ImportController.saveList(
        JSON.serialize(
          ImportTestPlans.listPlan(
            c.season.Id,
            new List<Object>{
              new Map<String, Object>{
                'kind' => 'Activity',
                'id' => c.archery.Id,
                'fields' => new Map<String, Object>{
                  'Notes__c' => 'Arm guards'
                },
                'refs' => new Map<String, Object>{
                  'RainPlan__c' => 'Activity:Board games'
                }
              },
              ImportTestPlans.newActivity(
                'Board games',
                new Map<String, Object>(),
                new List<Object>()
              )
            }
          )
        )
      );
      Assert.areEqual(1, result.changed.get('Activity'), 'counted once');
      Activity__c changed = [
        SELECT RainPlan__r.Name, Notes__c
        FROM Activity__c
        WHERE Id = :c.archery.Id
      ];
      Assert.areEqual('Board games', changed.RainPlan__r.Name);
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Activity__c back = [
        SELECT RainPlan__c, Notes__c
        FROM Activity__c
        WHERE Id = :c.archery.Id
      ];
      Assert.isNull(back.RainPlan__c);
      Assert.isNull(back.Notes__c);
      Assert.areEqual(1, undone.restored);
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Activity__c WHERE Name = 'Board games']
      );
    }
  }

  @IsTest
  static void aListNeverRenamesNorChangesWhatItCanOnlyAdd() {
    Camp c = camp();
    System.runAs(new User(Id = c.scheduler)) {
      Test.startTest();
      List<Map<String, Object>> attempts = new List<Map<String, Object>>{
        new Map<String, Object>{
          'kind' => 'Activity',
          'id' => c.archery.Id,
          'fields' => new Map<String, Object>{ 'Name' => 'Renamed' }
        },
        // A division is only ever added by a list (part B moves groups, within a program).
        new Map<String, Object>{
          'kind' => 'Division',
          'id' => c.juniors,
          'fields' => new Map<String, Object>()
        }
      };
      for (Map<String, Object> attempt : attempts) {
        try {
          ImportController.saveList(
            JSON.serialize(
              ImportTestPlans.listPlan(c.season.Id, new List<Object>{ attempt })
            )
          );
          Assert.fail('refused: ' + JSON.serialize(attempt));
        } catch (AuraHandledException e) {
          Assert.isTrue(
            e.getMessage().contains('Start it again'),
            e.getMessage()
          );
        }
      }
      Test.stopTest();
      Assert.areEqual(
        'Archery',
        [SELECT Name FROM Activity__c WHERE Id = :c.archery.Id].Name
      );
      Assert.areEqual(
        c.juniors,
        [SELECT Division__c FROM Group__c WHERE Id = :c.bunk1].Division__c
      );
    }
  }

  @IsTest
  static void aListTooLongToUndoIsRefusedBeforeAnythingIsSaved() {
    Camp c = camp();
    System.runAs(new User(Id = c.scheduler)) {
      List<Location__c> places = new List<Location__c>();
      for (Integer i = 0; i < 5; i++) {
        places.add(
          new Location__c(
            Season__c = c.season.Id,
            Name = 'Field ' + i,
            GroupsThatFit__c = 1
          )
        );
      }
      insert as user places;
      // Five notes of 30,000 characters each: what Undo would keep is over 131,072.
      String longNote = 'x'.repeat(30000);
      List<Object> records = new List<Object>();
      for (Location__c place : places) {
        records.add(
          new Map<String, Object>{
            'kind' => 'Location',
            'id' => place.Id,
            'fields' => new Map<String, Object>{ 'Notes__c' => longNote }
          }
        );
      }
      Test.startTest();
      try {
        ImportController.saveList(
          JSON.serialize(ImportTestPlans.listPlan(c.season.Id, records))
        );
        Assert.fail('too long to undo');
      } catch (AuraHandledException e) {
        Assert.isTrue(e.getMessage().contains('too long'), e.getMessage());
      }
      Test.stopTest();
      for (Location__c place : [SELECT Notes__c FROM Location__c]) {
        Assert.isNull(place.Notes__c, 'nothing was saved');
      }
      Assert.areEqual(0, [SELECT COUNT() FROM Import__c]);
    }
  }

  @IsTest
  static void refusesAnotherSeasonsRecordInALinkOrWhoList() {
    Camp c = camp();
    System.runAs(new User(Id = c.scheduler)) {
      Season__c other = ShoreshTestData.season(
        ShoreshTestData.camp('Other (made up)').Id,
        'Elsewhere'
      );
      Location__c theirPlace = new Location__c(
        Season__c = other.Id,
        Name = 'Their gym',
        GroupsThatFit__c = 1
      );
      insert as user theirPlace;
      Activity__c theirActivity = ShoreshTestData.activity(
        other.Id,
        'Theirs',
        null
      );
      insert as user theirActivity;
      Program__c theirProgram = ShoreshTestData.program(other.Id, 'Theirs');
      Id theirDivision = ShoreshTestData.division(theirProgram.Id, 'Theirs').Id;
      List<Map<String, Object>> attempts = new List<Map<String, Object>>{
        ImportTestPlans.newActivity(
          'A',
          new Map<String, Object>{ 'Location__c' => theirPlace.Id },
          new List<Object>()
        ),
        ImportTestPlans.newActivity(
          'B',
          new Map<String, Object>{ 'RainPlan__c' => theirActivity.Id },
          new List<Object>()
        ),
        ImportTestPlans.newActivity(
          'C',
          new Map<String, Object>(),
          new List<Object>{ theirDivision }
        )
      };
      Test.startTest();
      for (Map<String, Object> attempt : attempts) {
        try {
          ImportController.saveList(
            JSON.serialize(
              ImportTestPlans.listPlan(c.season.Id, new List<Object>{ attempt })
            )
          );
          Assert.fail('refused: ' + JSON.serialize(attempt));
        } catch (AuraHandledException e) {
          Assert.isTrue(
            e.getMessage().contains('Start it again'),
            e.getMessage()
          );
        }
      }
      Test.stopTest();
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Activity__c WHERE Name IN ('A', 'B', 'C')]
      );
    }
  }

  @IsTest
  static void refusesARecordSentAsAnotherKind() {
    Camp c = camp();
    System.runAs(new User(Id = c.scheduler)) {
      Test.startTest();
      try {
        ImportController.saveList(
          JSON.serialize(
            ImportTestPlans.listPlan(
              c.season.Id,
              new List<Object>{
                new Map<String, Object>{
                  'kind' => 'Location',
                  'id' => c.archery.Id,
                  'fields' => new Map<String, Object>{ 'Notes__c' => 'x' }
                }
              }
            )
          )
        );
        Assert.fail('an activity sent as a location');
      } catch (AuraHandledException e) {
        Assert.isTrue(
          e.getMessage().contains('Start it again'),
          e.getMessage()
        );
      }
      Test.stopTest();
    }
  }

  /**
   * Namespace safety: a list whose screen names fields with the package's prefix changes the
   * same fields and who; its log, spelled with the prefix (fields, the who rows' object), is
   * undone exactly as one without; and a new activity added that way is removed.
   */
  @IsTest
  static void aListAndLogSpelledWithTheNamespaceAreReadTheSame() {
    Camp c = camp();
    System.runAs(new User(Id = c.scheduler)) {
      ShoreshSchema.simulatedPrefix = 'shoresh__';
      Map<String, Object> sent = ImportTestPlans.listPlan(
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
          },
          ImportTestPlans.newActivity(
            'Climbing',
            new Map<String, Object>{
              'Location__c' => c.gym.Id,
              'RainPlan__c' => c.archery.Id
            },
            new List<Object>{ c.juniors }
          )
        }
      );
      ImportSetupSaves.Result result = ImportController.saveList(
        JSON.serialize(ImportTestPlans.packaged(sent))
      );
      Assert.areEqual(1, result.changed.get('Activity'));
      Assert.areEqual(1, result.added.get('Activity'));
      Activity__c changed = [
        SELECT
          TimesPerWeekMin__c,
          NoWeeklyMax__c,
          Location__c,
          (SELECT Division__c, Group__c FROM Eligibilities__r)
        FROM Activity__c
        WHERE Id = :c.archery.Id
      ];
      Assert.areEqual(2, changed.TimesPerWeekMin__c);
      Assert.isTrue(changed.NoWeeklyMax__c);
      Assert.isNull(changed.Location__c);
      Assert.areEqual(2, changed.Eligibilities__r.size());
      Activity__c climbing = [
        SELECT Length__c, RainPlan__c, Location__c
        FROM Activity__c
        WHERE Name = 'Climbing'
      ];
      Assert.areEqual(1, climbing.Length__c);
      Assert.areEqual(c.archery.Id, climbing.RainPlan__c);
      Assert.areEqual(c.gym.Id, climbing.Location__c);

      Import__c packaged = ImportTestPlans.packageLog(result.importId);
      Assert.isTrue(
        packaged.Changed__c.contains(
          '"type":"shoresh__ActivityEligibility__c"'
        ),
        packaged.Changed__c
      );
      Assert.isTrue(
        packaged.Changed__c.contains('"shoresh__TimesPerWeekMin__c"'),
        packaged.Changed__c
      );

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
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Activity__c WHERE Name = 'Climbing']
      );
      Assert.areEqual(
        0,
        undone.keptEdited.size(),
        String.valueOf(undone.keptEdited)
      );
    }
  }
}
