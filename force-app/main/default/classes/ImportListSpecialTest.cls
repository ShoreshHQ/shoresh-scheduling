/**
 * The Special events screen's list (docs/protocol/special.md SPECIAL-2.3 to 2.8): special days
 * and events imported with Import a list, saved all or none in user mode through the list save,
 * a new special day started from the regular day, undone with Undo this import, and items
 * deleted on the screen remembered so the list leaves them out. Every test acts as a scheduler
 * and makes its camp inside the same System.runAs. Made-up camp only.
 */
@IsTest
private class ImportListSpecialTest {
  private static final String UNREADABLE = 'The import could not be read. Start it again.';
  // No notes, and no place.
  private static final List<Object> NOTHING = new List<Object>{ null, null };

  private static Map<String, Object> plan(Id seasonId, List<Object> records) {
    Map<String, Object> result = ImportTestPlans.listPlan(seasonId, records);
    result.put('screen', 'specialEvents');
    result.put('files', 'special.csv (Special events)');
    return result;
  }

  /** A new special day or event as the screen sends it: its notes, and an event's place. */
  private static Map<String, Object> added(
    String kind,
    String name,
    List<Object> notesAndPlace
  ) {
    Map<String, Object> refs = new Map<String, Object>();
    if (kind == 'SpecialEvent') {
      refs.put('Location__c', notesAndPlace[1]);
    }
    return new Map<String, Object>{
      'kind' => kind,
      'key' => 'SpecialItem:' +
      kind +
      ':' +
      name,
      'fields' => new Map<String, Object>{
        'Name' => name,
        'Notes__c' => notesAndPlace[0]
      },
      'refs' => refs
    };
  }

  /** A change to an item set up: its fields and links, as the screen sends them. */
  private static Map<String, Object> changed(
    String kind,
    Id recordId,
    List<Map<String, Object>> fieldsAndRefs
  ) {
    return new Map<String, Object>{
      'kind' => kind,
      'id' => recordId,
      'fields' => fieldsAndRefs[0],
      'refs' => fieldsAndRefs[1]
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

  private static List<String> names(ScheduleGrid grid) {
    List<String> result = new List<String>();
    for (ScheduleGrid.Item item : grid.items) {
      result.add(item.name);
    }
    return result;
  }

  // SPECIAL-2.3, SPECIAL-2.6
  @IsTest
  static void addsSpecialDaysStartedFromTheRegularDayAndEventsAtTheirPlaceWithinBounds() {
    System.runAs(ShoreshTestData.scheduler()) {
      // Main: Period 1, Period 2, Lunch; three groups; runs Monday to Thursday; six weeks.
      Map<String, Id> ids = SetTimeTestData.camp();
      Id seasonId = ids.get('Season');
      SetTimeTestData.save(
        new List<SObject>{ SetTimeTestData.fixed(ids, 'Lunch break', 'Lunch') }
      );
      Location__c lake = new Location__c(
        Season__c = seasonId,
        Name = 'Lake',
        GroupsThatFit__c = 2
      );
      Database.insert(lake, AccessLevel.USER_MODE);
      List<Object> records = new List<Object>{
        new Map<String, Object>{
          'kind' => 'Location',
          'key' => 'Location:Amphitheater',
          'fields' => new Map<String, Object>{
            'Name' => 'Amphitheater',
            'GroupsThatFit__c' => 1
          }
        }
      };
      for (Integer i = 0; i < 30; i++) {
        records.add(added('SpecialDay', 'Theme Day ' + i, NOTHING));
        records.add(
          added(
            'SpecialEvent',
            'Show ' + i,
            new List<Object>{
              'Bring chairs',
              Math.mod(i, 2) == 0 ? (Object) lake.Id : 'Location:Amphitheater'
            }
          )
        );
      }

      Test.startTest();
      Integer before = Limits.getQueries();
      ImportSetupSaves.Result result = save(plan(seasonId, records));
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used < 60, 'Queries for a 60-item list: ' + used);
      Assert.areEqual(30, result.added.get('SpecialDay'));
      Assert.areEqual(30, result.added.get('SpecialEvent'));
      Assert.areEqual(1, result.added.get('Location'));
      Assert.isNotNull(result.importId);
      // What they started from, for the screen to say as the blank row does.
      Assert.areEqual('Main', result.seeded.program);
      Assert.areEqual(
        new List<String>{ 'Lunch break' },
        result.seeded.broughtIn
      );
      // Every special day starts as one added by hand: Main's time blocks, Lunch brought in.
      SpecialDay__c day = [
        SELECT Id
        FROM SpecialDay__c
        WHERE Name = 'Theme Day 7'
        WITH USER_MODE
      ];
      SpecialPlans.Plan dayPlan = SpecialPlans.read(day.Id);
      Assert.areEqual(1, dayPlan.revision);
      Assert.areEqual(3, dayPlan.grid.blocks.size());
      Assert.areEqual('Period 1', dayPlan.grid.blocks[0].name);
      Assert.areEqual(new List<String>{ 'Lunch break' }, names(dayPlan.grid));
      Assert.areEqual(
        30,
        [
          SELECT COUNT()
          FROM PlanPart__c
          WHERE SpecialDay__r.Season__c = :seasonId
        ]
      );
      SpecialEvent__c show = [
        SELECT Location__r.Name, Notes__c
        FROM SpecialEvent__c
        WHERE Name = 'Show 3'
        WITH USER_MODE
      ];
      Assert.areEqual('Amphitheater', show.Location__r.Name);
      Assert.areEqual('Bring chairs', show.Notes__c);
      // An event starts with no plan, as one added by hand.
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM PlanPart__c WHERE SpecialEvent__c != NULL]
      );
    }
  }

  // SPECIAL-2.3
  @IsTest
  static void changesOnlyNotesAndAnEventsPlaceAndNeverRenamesOrPlacesASpecialDay() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = ShoreshTestData.season(
        ShoreshTestData.camp('Cedar Bend (made up)').Id,
        'Summer 2027'
      );
      Location__c lake = new Location__c(
        Season__c = season.Id,
        Name = 'Lake',
        GroupsThatFit__c = 2
      );
      Database.insert(lake, AccessLevel.USER_MODE);
      SpecialDay__c colorWar = new SpecialDay__c(
        Season__c = season.Id,
        Name = 'Color War'
      );
      SpecialEvent__c carnival = new SpecialEvent__c(
        Season__c = season.Id,
        Name = 'Carnival'
      );
      Database.insert(
        new List<SObject>{ colorWar, carnival },
        AccessLevel.USER_MODE
      );
      Test.startTest();
      ImportSetupSaves.Result result = save(
        plan(
          season.Id,
          new List<Object>{
            changed(
              'SpecialDay',
              colorWar.Id,
              new List<Map<String, Object>>{
                new Map<String, Object>{ 'Notes__c' => 'Wear team colors' },
                new Map<String, Object>()
              }
            ),
            changed(
              'SpecialEvent',
              carnival.Id,
              new List<Map<String, Object>>{
                new Map<String, Object>(),
                new Map<String, Object>{ 'Location__c' => lake.Id }
              }
            )
          }
        )
      );
      String renamed = refusal(
        plan(
          season.Id,
          new List<Object>{
            changed(
              'SpecialEvent',
              carnival.Id,
              new List<Map<String, Object>>{
                new Map<String, Object>{ 'Name' => 'Fair' },
                new Map<String, Object>()
              }
            )
          }
        )
      );
      String dayPlaced = refusal(
        plan(
          season.Id,
          new List<Object>{
            changed(
              'SpecialDay',
              colorWar.Id,
              new List<Map<String, Object>>{
                new Map<String, Object>(),
                new Map<String, Object>{ 'Location__c' => lake.Id }
              }
            )
          }
        )
      );
      Test.stopTest();
      Assert.areEqual(1, result.changed.get('SpecialDay'));
      Assert.areEqual(1, result.changed.get('SpecialEvent'));
      Assert.areEqual(UNREADABLE, renamed);
      Assert.areEqual(UNREADABLE, dayPlaced);
      Assert.areEqual(
        'Wear team colors',
        [SELECT Notes__c FROM SpecialDay__c WHERE Id = :colorWar.Id].Notes__c
      );
      SpecialEvent__c after = [
        SELECT Name, Location__c
        FROM SpecialEvent__c
        WHERE Id = :carnival.Id
      ];
      Assert.areEqual('Carnival', after.Name);
      Assert.areEqual(lake.Id, after.Location__c);
    }
  }

  // SPECIAL-2.3
  @IsTest
  static void aSpecialItemOfAnotherSeasonIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = ShoreshTestData.season(
        ShoreshTestData.camp('Cedar Bend (made up)').Id,
        'Summer 2027'
      );
      Season__c other = ShoreshTestData.season(
        ShoreshTestData.camp('Birch Run (made up)').Id,
        'Summer 2027'
      );
      SpecialEvent__c carnival = new SpecialEvent__c(
        Season__c = season.Id,
        Name = 'Carnival'
      );
      Database.insert(carnival, AccessLevel.USER_MODE);
      Test.startTest();
      String refused = refusal(
        plan(
          other.Id,
          new List<Object>{
            changed(
              'SpecialEvent',
              carnival.Id,
              new List<Map<String, Object>>{
                new Map<String, Object>{ 'Notes__c' => 'Moved' },
                new Map<String, Object>()
              }
            )
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
      Assert.isNull(
        [SELECT Notes__c FROM SpecialEvent__c WHERE Id = :carnival.Id].Notes__c
      );
    }
  }

  // SPECIAL-2.8
  @IsTest
  static void undoRemovesWhatTheListAddedAndKeepsOnesWorkedOnSince() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id seasonId = ids.get('Season');
      SpecialEvent__c carnival = new SpecialEvent__c(
        Season__c = seasonId,
        Name = 'Carnival',
        Notes__c = 'Bring tickets'
      );
      Database.insert(carnival, AccessLevel.USER_MODE);
      ImportSetupSaves.Result result = save(
        plan(
          seasonId,
          new List<Object>{
            added('SpecialDay', 'Maccabiah', NOTHING),
            added('SpecialDay', 'Field Day', NOTHING),
            added('SpecialEvent', 'Talent Show', NOTHING),
            added('SpecialEvent', 'Campfire', NOTHING),
            changed(
              'SpecialEvent',
              carnival.Id,
              new List<Map<String, Object>>{
                new Map<String, Object>{ 'Notes__c' => 'Free entry' },
                new Map<String, Object>()
              }
            )
          }
        )
      );
      // Since the import: Field Day's schedule saved by the director, Campfire put on a day.
      SpecialDay__c fieldDay = [
        SELECT Id
        FROM SpecialDay__c
        WHERE Name = 'Field Day'
        WITH USER_MODE
      ];
      SpecialPlans.write(fieldDay.Id, SpecialPlans.read(fieldDay.Id).grid, 1);
      SpecialEvent__c campfire = [
        SELECT Id
        FROM SpecialEvent__c
        WHERE Name = 'Campfire'
        WITH USER_MODE
      ];
      Database.insert(
        new SpecialDate__c(
          Season__c = seasonId,
          SpecialEvent__c = campfire.Id,
          Week__c = ids.get('Week 2'),
          Day__c = 'Monday'
        ),
        AccessLevel.USER_MODE
      );
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM SpecialDay__c
          WHERE Name = 'Maccabiah'
        ],
        'Maccabiah and its plan are gone'
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM SpecialEvent__c WHERE Name = 'Talent Show']
      );
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM PlanPart__c
          WHERE SpecialDay__r.Season__c = :seasonId
        ],
        'Only Field Day\'s plan is left'
      );
      Set<String> kept = new Set<String>(undone.keptInUse);
      Assert.isTrue(kept.contains('Field Day'), String.valueOf(undone));
      Assert.isTrue(kept.contains('Campfire'), String.valueOf(undone));
      Assert.areEqual(
        'Bring tickets',
        [SELECT Notes__c FROM SpecialEvent__c WHERE Id = :carnival.Id].Notes__c,
        'Carnival\'s notes are put back'
      );
    }
  }

  // SPECIAL-2.7
  @IsTest
  static void deletingASpecialDayOrEventOnTheScreenIsRememberedForTheList() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Cedar Bend (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      SpecialDay__c colorWar = new SpecialDay__c(
        Season__c = season.Id,
        Name = 'Color War'
      );
      SpecialEvent__c carnival = new SpecialEvent__c(
        Season__c = season.Id,
        Name = 'Carnival'
      );
      Database.insert(
        new List<SObject>{ colorWar, carnival },
        AccessLevel.USER_MODE
      );
      Test.startTest();
      SeasonSetupController.deleteRecord(colorWar.Id);
      SeasonSetupController.deleteRecord(carnival.Id);
      Test.stopTest();
      Set<String> remembered = new Set<String>();
      for (ImportAnswers.Answer answer : ImportController.getAnswers(camp.Id)) {
        if (answer.answer == SetupDeletions.DELETED) {
          remembered.add(answer.key);
        }
      }
      Assert.areEqual(
        new Set<String>{
          'deleted|SpecialDay||Color War',
          'deleted|SpecialEvent||Carnival'
        },
        remembered
      );
    }
  }
}
