/**
 * The Electives screen's list (plan §6.2, repo ADR 0018): offerings imported with Import a
 * list, saved all or none in user mode, undone with Undo last import, and things deleted on the
 * screen remembered so the list leaves them out. Every test acts as a scheduler and makes its
 * camp inside the same System.runAs. Made-up camp only.
 */
@IsTest
private class ImportListOfferingsTest {
  private class Camp {
    Season__c season;
    ElectiveSet__c chugim;
    Activity__c archery;
    Activity__c drama;
    Offering__c archeryOffered;

    Camp() {
      Camp__c record = ShoreshTestData.camp('Cedar Bend (made up)');
      season = ShoreshTestData.season(record.Id, 'Summer 2027');
      archery = ShoreshTestData.activity(season.Id, 'Archery', null);
      drama = ShoreshTestData.activity(season.Id, 'Drama', null);
      Database.insert(
        new List<Activity__c>{ archery, drama },
        AccessLevel.USER_MODE
      );
      chugim = new ElectiveSet__c(Season__c = season.Id, Name = 'Chugim');
      Database.insert(chugim, AccessLevel.USER_MODE);
      archeryOffered = new Offering__c(
        ElectiveSet__c = chugim.Id,
        Activity__c = archery.Id,
        Seats__c = 12
      );
      Database.insert(archeryOffered, AccessLevel.USER_MODE);
    }
  }

  private static Map<String, Object> plan(Id seasonId, List<Object> records) {
    Map<String, Object> result = ImportTestPlans.listPlan(seasonId, records);
    result.put('screen', 'electives');
    result.put('files', 'offerings.csv (Electives)');
    return result;
  }

  private static Map<String, Object> newSet(String name) {
    return new Map<String, Object>{
      'kind' => 'ElectiveSet',
      'key' => 'ElectiveSet:' + name,
      'fields' => new Map<String, Object>{ 'Name' => name }
    };
  }

  /** A new offering as the screen sends it: its set and activity by Id or by key. */
  private static Map<String, Object> newOffering(
    String setRef,
    String activityRef,
    Object seats,
    Boolean noLimit
  ) {
    return new Map<String, Object>{
      'kind' => 'Offering',
      'key' => 'Offering:' +
      setRef +
      ':' +
      activityRef,
      'fields' => new Map<String, Object>{
        'Seats__c' => seats,
        'NoSeatLimit__c' => noLimit,
        'MinimumToRun__c' => null,
        'Proposed__c' => true
      },
      'refs' => new Map<String, Object>{
        'ElectiveSet__c' => setRef,
        'Activity__c' => activityRef
      }
    };
  }

  private static ImportSetupSaves.Result save(Map<String, Object> sent) {
    return ImportController.saveList(JSON.serialize(sent));
  }

  private static String refusal(Map<String, Object> sent) {
    try {
      save(sent);
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    Assert.fail('The save is refused');
    return null;
  }

  @IsTest
  static void addsASetActivitiesAndTheirOfferingsProposedIn250PlusRowsWithinBounds() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      List<Object> records = new List<Object>{ newSet('Bechirot') };
      for (Integer i = 0; i < 260; i++) {
        String name = 'Elective ' + (1000 + i);
        records.add(
          ImportTestPlans.newActivity(
            name,
            new Map<String, Object>(),
            new List<Object>()
          )
        );
        records.add(
          newOffering('ElectiveSet:Bechirot', 'Activity:' + name, 10, false)
        );
      }
      // An activity the season has, offered in a set the season has, with no seat limit.
      records.add(newOffering(c.chugim.Id, c.drama.Id, null, true));
      Test.startTest();
      Integer before = Limits.getQueries();
      ImportSetupSaves.Result result = save(plan(c.season.Id, records));
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used < 60, 'Queries for a 261-offering list: ' + used);
      Assert.areEqual(1, result.added.get('ElectiveSet'));
      Assert.areEqual(260, result.added.get('Activity'));
      Assert.areEqual(261, result.added.get('Offering'));
      Assert.isNotNull(result.importId);
      List<Offering__c> bechirot = [
        SELECT Seats__c, NoSeatLimit__c, Proposed__c
        FROM Offering__c
        WHERE ElectiveSet__r.Name = 'Bechirot'
        WITH USER_MODE
      ];
      Assert.areEqual(260, bechirot.size());
      Assert.areEqual(10, bechirot[0].Seats__c.intValue());
      Assert.isTrue(bechirot[0].Proposed__c);
      Offering__c drama = [
        SELECT NoSeatLimit__c, Seats__c, Proposed__c
        FROM Offering__c
        WHERE Activity__c = :c.drama.Id
        WITH USER_MODE
      ];
      Assert.isTrue(drama.NoSeatLimit__c);
      Assert.isNull(drama.Seats__c);
    }
  }

  @IsTest
  static void changesOnlyTheFieldsSentOnAnOfferingSetUp() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      Test.startTest();
      ImportSetupSaves.Result result = save(
        plan(
          c.season.Id,
          new List<Object>{
            new Map<String, Object>{
              'kind' => 'Offering',
              'id' => c.archeryOffered.Id,
              'fields' => new Map<String, Object>{
                'Seats__c' => 15,
                'NoSeatLimit__c' => false
              },
              'refs' => new Map<String, Object>()
            }
          }
        )
      );
      Test.stopTest();
      Assert.areEqual(1, result.changed.get('Offering'));
      Offering__c archery = [
        SELECT Seats__c, MinimumToRun__c, Proposed__c, Activity__c
        FROM Offering__c
        WHERE Id = :c.archeryOffered.Id
        WITH USER_MODE
      ];
      Assert.areEqual(15, archery.Seats__c.intValue());
      Assert.isFalse(archery.Proposed__c);
      Assert.areEqual(c.archery.Id, archery.Activity__c);
    }
  }

  @IsTest
  static void anOfferingSetUpNeverMovesToAnotherSetOrActivityAndASetIsNeverRenamed() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      Map<String, Object> moving = new Map<String, Object>{
        'kind' => 'Offering',
        'id' => c.archeryOffered.Id,
        'fields' => new Map<String, Object>(),
        'refs' => new Map<String, Object>{ 'Activity__c' => c.drama.Id }
      };
      Map<String, Object> renaming = new Map<String, Object>{
        'kind' => 'ElectiveSet',
        'id' => c.chugim.Id,
        'fields' => new Map<String, Object>{ 'Name' => 'Bechirot' }
      };
      Test.startTest();
      String moved = refusal(plan(c.season.Id, new List<Object>{ moving }));
      String renamed = refusal(plan(c.season.Id, new List<Object>{ renaming }));
      Test.stopTest();
      Assert.areEqual('The import could not be read. Start it again.', moved);
      Assert.areEqual('The import could not be read. Start it again.', renamed);
      Assert.areEqual(
        c.archery.Id,
        [
          SELECT Activity__c
          FROM Offering__c
          WHERE Id = :c.archeryOffered.Id
          WITH USER_MODE
        ]
        .Activity__c
      );
    }
  }

  @IsTest
  static void anOfferingOfAnotherSeasonIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      Season__c other = ShoreshTestData.season(
        ShoreshTestData.camp('Birch Run (made up)').Id,
        'Summer 2027'
      );
      Test.startTest();
      String refused = refusal(
        plan(
          other.Id,
          new List<Object>{
            new Map<String, Object>{
              'kind' => 'Offering',
              'id' => c.archeryOffered.Id,
              'fields' => new Map<String, Object>{ 'Seats__c' => 1 },
              'refs' => new Map<String, Object>()
            }
          }
        )
      );
      Test.stopTest();
      Assert.isTrue(
        refused.startsWith(
          'The import refers to something that is not in this'
        ),
        refused
      );
      Assert.areEqual(
        12,
        [
            SELECT Seats__c
            FROM Offering__c
            WHERE Id = :c.archeryOffered.Id
            WITH USER_MODE
          ]
          .Seats__c.intValue()
      );
    }
  }

  @IsTest
  static void undoRemovesWhatTheListAddedAndKeepsASetWithAnOfferingAddedByHand() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      ImportSetupSaves.Result result = save(
        plan(
          c.season.Id,
          new List<Object>{
            newSet('Bechirot'),
            newSet('Tzrif'),
            ImportTestPlans.newActivity(
              'Kayaking',
              new Map<String, Object>(),
              new List<Object>()
            ),
            newOffering('ElectiveSet:Bechirot', 'Activity:Kayaking', 8, false),
            newOffering('ElectiveSet:Tzrif', c.drama.Id, 8, false),
            new Map<String, Object>{
              'kind' => 'Offering',
              'id' => c.archeryOffered.Id,
              'fields' => new Map<String, Object>{ 'Seats__c' => 20 },
              'refs' => new Map<String, Object>()
            }
          }
        )
      );
      // Added by hand in Tzrif after the import: Tzrif stays.
      ElectiveSet__c tzrif = [
        SELECT Id
        FROM ElectiveSet__c
        WHERE Name = 'Tzrif'
        WITH USER_MODE
      ];
      Database.insert(
        new Offering__c(ElectiveSet__c = tzrif.Id, Activity__c = c.archery.Id),
        AccessLevel.USER_MODE
      );
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM ElectiveSet__c WHERE Name = 'Bechirot'],
        'Bechirot and its offering are gone'
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Activity__c WHERE Name = 'Kayaking']
      );
      Assert.areEqual(1, undone.keptInUse.size(), String.valueOf(undone));
      Assert.areEqual('Tzrif', undone.keptInUse[0]);
      Assert.areEqual(
        12,
        [
            SELECT Seats__c
            FROM Offering__c
            WHERE Id = :c.archeryOffered.Id
            WITH USER_MODE
          ]
          .Seats__c.intValue(),
        'Archery\'s seats are put back'
      );
      // Drama's offering in Tzrif was the import's: removed; the hand-added one stays.
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Offering__c WHERE ElectiveSet__c = :tzrif.Id]
      );
    }
  }

  @IsTest
  static void undoNamesAnOfferingEditedSinceByItsActivity() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      ImportSetupSaves.Result result = save(
        plan(
          c.season.Id,
          new List<Object>{ newOffering(c.chugim.Id, c.drama.Id, 8, false) }
        )
      );
      Offering__c drama = [
        SELECT Id
        FROM Offering__c
        WHERE Activity__c = :c.drama.Id
        WITH USER_MODE
      ];
      drama.Seats__c = 9;
      Database.update(drama, AccessLevel.USER_MODE);
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(
        new List<String>{ 'Drama' },
        undone.keptEdited,
        String.valueOf(undone)
      );
    }
  }

  @IsTest
  static void deletingAnOfferingOrASetOnTheScreenIsRememberedForTheList() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      ElectiveSet__c bechirot = new ElectiveSet__c(
        Season__c = c.season.Id,
        Name = 'Bechirot'
      );
      Database.insert(bechirot, AccessLevel.USER_MODE);
      Id campId = [
        SELECT Camp__c
        FROM Season__c
        WHERE Id = :c.season.Id
        WITH USER_MODE
      ]
      .Camp__c;
      Test.startTest();
      Integer before = Limits.getQueries();
      SeasonSetupController.deleteRecord(c.archeryOffered.Id);
      Integer used = Limits.getQueries() - before;
      SeasonSetupController.deleteRecord(bechirot.Id);
      Test.stopTest();
      Assert.isTrue(used <= 20, 'Queries to delete an offering: ' + used);
      Set<String> remembered = new Set<String>();
      for (ImportAnswers.Answer answer : ImportController.getAnswers(campId)) {
        if (answer.answer == SetupDeletions.DELETED) {
          remembered.add(answer.key);
        }
      }
      Assert.isTrue(
        remembered.contains('deleted|Offering|Chugim|Archery'),
        String.valueOf(remembered)
      );
      Assert.isTrue(
        remembered.contains('deleted|ElectiveSet||Bechirot'),
        String.valueOf(remembered)
      );
    }
  }
}
