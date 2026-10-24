/**
 * Electives in last year's file (electives slice E9; repo ADR 0006 choice 23, ADR 0018 choices 45
 * to 50): Import last year saves the elective sets it read, their proposed offerings and the
 * linked choices a double period makes; the linked periods are marked as guessed; Undo takes them
 * away; a linked choice the director deletes is remembered. Every test acts as a scheduler, with
 * its records made inside the same System.runAs. Made-up camp only (ImportTestPlans).
 */
@IsTest
private class ImportElectivesTest {
  private static final String SET_KEY = 'ES|Chugim';

  @TestSetup
  static void setup() {
    User scheduler = ShoreshTestData.scheduler();
    Season__c season;
    System.runAs(scheduler) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      ShoreshTestData.weeks(season.Id, 1);
    }
    KeptCamp.keepIds(
      new Map<String, Id>{
        'Camp' => season.Camp__c,
        'Season' => season.Id,
        'Scheduler' => scheduler.Id
      }
    );
  }

  private static Season__c keptSeason(Map<String, Id> kept) {
    return new Season__c(Id = kept.get('Season'), Camp__c = kept.get('Camp'));
  }

  private static User scheduler(Map<String, Id> kept) {
    return new User(Id = kept.get('Scheduler'));
  }

  private static String offeringKey(String activity) {
    return 'O|' + SET_KEY + '|' + activity;
  }

  private static String linkedKey(String activity) {
    return 'LC|' + offeringKey(activity) + '|P0|Tuesday|0,2';
  }

  /**
   * The new camp's week (ImportTestPlans.newCamp) with Chugim read in the file: two choices,
   * Hiking and Fishing, each linked across Period 1 and Period 2 on Tuesday, and Chugim on
   * Tuesday's version in both periods.
   */
  private static Map<String, Object> planWithElectives(Season__c season) {
    Map<String, Object> plan = ImportTestPlans.newCamp(season.Id);
    List<Object> guessed = new List<Object>();
    plan.put('electiveSets', new List<Object>());
    plan.put('offerings', new List<Object>());
    plan.put('linkedChoices', new List<Object>());
    ImportTestPlans.add(
      plan,
      'electiveSets',
      ImportTestPlans.entry(
        new List<Object>{ 'key', SET_KEY, 'name', 'Chugim' }
      )
    );
    Integer position = 0;
    for (String activity : new List<String>{ 'Fishing', 'Hiking' }) {
      position++;
      ImportTestPlans.add(
        plan,
        'activities',
        ImportTestPlans.entry(
          new List<Object>{
            'key',
            'A|' + activity,
            'name',
            activity,
            'length',
            1,
            'min',
            0,
            'max',
            0,
            'groupsAtOnce',
            1,
            'who',
            new List<Object>(),
            'sortOrder',
            10 + position
          }
        )
      );
      ImportTestPlans.add(
        plan,
        'offerings',
        ImportTestPlans.entry(
          new List<Object>{
            'key',
            offeringKey(activity),
            'name',
            activity,
            'setKey',
            SET_KEY,
            'activityKey',
            'A|' + activity
          }
        )
      );
      ImportTestPlans.add(
        plan,
        'linkedChoices',
        ImportTestPlans.entry(
          new List<Object>{
            'key',
            linkedKey(activity),
            'name',
            activity,
            'setKey',
            SET_KEY,
            'offeringKey',
            offeringKey(activity),
            'sortOrder',
            position,
            'times',
            new List<Object>{
              new Map<String, Object>{
                'weekday' => 'Tuesday',
                'blockKey' => 'B|P0|0'
              },
              new Map<String, Object>{
                'weekday' => 'Tuesday',
                'blockKey' => 'B|P0|2'
              }
            }
          }
        )
      );
      guessed.add(
        new Map<String, Object>{
          'kind' => 'LinkedChoice',
          'key' => linkedKey(activity),
          'fields' => new List<Object>{ 'periods' }
        }
      );
    }
    plan.put('guessed', guessed);
    Week__c week = [
      SELECT Id, StartDate__c
      FROM Week__c
      WHERE Season__c = :season.Id
      WITH USER_MODE
      LIMIT 1
    ];
    Map<String, Object> grid = new Map<String, Object>{
      'b' => new List<Object>{
        new List<Object>{ 'B|P0|0', 'Period 1', '09:00', '09:45' },
        new List<Object>{ 'B|P0|1', 'Lunch', '12:00', '12:45' },
        new List<Object>{ 'B|P0|2', 'Period 2', '13:00', '13:45' }
      },
      'g' => new List<Object>{
        new List<Object>{ 'G|Bunk 1', 'Bunk 1' },
        new List<Object>{ 'G|Bunk 2', 'Bunk 2' },
        new List<Object>{ 'G|Bunk 3', 'Bunk 3' },
        new List<Object>{ 'G|Bunk 4', 'Bunk 4' }
      },
      'i' => new List<Object>{
        new List<Object>{ 'E', SET_KEY, 'Chugim' },
        new List<Object>{ 'F', 'F|P0|Lunch', 'Lunch' }
      },
      'r' => new List<Object>{ '1,2,1', '1,2,1', '1,2,1', '1,2,1' }
    };
    ImportTestPlans.add(
      plan,
      'versions',
      ImportTestPlans.entry(
        new List<Object>{
          'programKey',
          'P0',
          'weekId',
          week.Id,
          'name',
          'Imported from maple-grove.xlsx',
          'days',
          new List<Object>{
            new Map<String, Object>{
              'date' => String.valueOf(week.StartDate__c.addDays(1)),
              'grid' => grid
            }
          }
        }
      )
    );
    return plan;
  }

  private static ImportSetupSaves.Result save(Map<String, Object> plan) {
    return ImportController.saveSetup(JSON.serialize(plan));
  }

  private static List<LinkedChoice__c> linkedChoices(Id seasonId) {
    return [
      SELECT
        Id,
        Name,
        AppliesTo__c,
        SortOrder__c,
        Offering__r.Activity__r.Name,
        (SELECT Weekday__c, TimeBlock__r.Name FROM Times__r)
      FROM LinkedChoice__c
      WHERE ElectiveSet__r.Season__c = :seasonId
      WITH USER_MODE
      ORDER BY SortOrder__c
    ];
  }

  @IsTest
  static void savesTheSetsTheirProposedOfferingsAndLinkedChoices() {
    Map<String, Id> kept = KeptCamp.keptIds();
    System.runAs(scheduler(kept)) {
      Season__c season = keptSeason(kept);
      Map<String, Object> plan = planWithElectives(season);
      Test.startTest();
      ImportSetupSaves.Result result = save(plan);
      Integer queries = Limits.getQueries();
      Test.stopTest();

      Assert.areEqual(1, result.added.get('ElectiveSet'));
      Assert.areEqual(2, result.added.get('Offering'));
      Assert.areEqual(2, result.added.get('LinkedChoice'));
      // Measured 51 in the test org (2026-10-23); well under Salesforce's 100.
      Assert.isTrue(queries < 65, 'queries: ' + queries);
      ElectiveSet__c chugim = [
        SELECT
          Id,
          Name,
          (
            SELECT Proposed__c, Seats__c, NoSeatLimit__c, Activity__r.Name
            FROM Offerings__r
            ORDER BY Activity__r.Name
          )
        FROM ElectiveSet__c
        WHERE Season__c = :season.Id
        WITH USER_MODE
      ];
      Assert.areEqual('Chugim', chugim.Name);
      Assert.areEqual(2, chugim.Offerings__r.size());
      for (Offering__c offering : chugim.Offerings__r) {
        Assert.isTrue(offering.Proposed__c, 'proposed until confirmed');
        Assert.isNull(offering.Seats__c, 'seats not filled in yet');
        Assert.isFalse(offering.NoSeatLimit__c);
      }
      List<LinkedChoice__c> linked = linkedChoices(season.Id);
      Assert.areEqual(2, linked.size());
      Assert.areEqual('Fishing', linked[0].Name);
      Assert.areEqual('Fishing', linked[0].Offering__r.Activity__r.Name);
      Assert.areEqual('All', linked[0].AppliesTo__c);
      Assert.areEqual(2, linked[0].Times__r.size());
      for (LinkedChoiceTime__c period : linked[0].Times__r) {
        Assert.areEqual('Tuesday', period.Weekday__c);
      }
      // The version holds the set by its record, in both periods.
      ScheduleDay__c day = [
        SELECT Grid__c
        FROM ScheduleDay__c
        WHERE Schedule__r.Program__r.Season__c = :season.Id
        WITH USER_MODE
        LIMIT 1
      ];
      ScheduleGrid grid = ScheduleGrid.fromText(day.Grid__c);
      Assert.areEqual('E', grid.items[0].kind);
      Assert.areEqual(String.valueOf(chugim.Id), grid.items[0].id);
    }
  }

  @IsTest
  static void linkedPeriodsAreMarkedAsGuessedUntilLooksRightOrAChange() {
    Map<String, Id> kept = KeptCamp.keptIds();
    System.runAs(scheduler(kept)) {
      Season__c season = keptSeason(kept);
      save(planWithElectives(season));
      List<LinkedChoice__c> linked = linkedChoices(season.Id);
      Test.startTest();
      Set<Id> marked = periodMarks(season.Id);
      Assert.areEqual(
        new Set<Id>{ linked[0].Id, linked[1].Id },
        marked,
        'both linked choices marked'
      );
      SetupGuessesController.confirmGuess(linked[0].Id, 'periods');
      // A period taken away by hand is a change: no longer as guessed.
      delete as user [
        SELECT Id
        FROM LinkedChoiceTime__c
        WHERE LinkedChoice__c = :linked[1].Id
        LIMIT 1
      ];
      Set<Id> remaining = periodMarks(season.Id);
      Test.stopTest();
      Assert.isTrue(remaining.isEmpty(), 'marks left: ' + remaining);
    }
  }

  private static Set<Id> periodMarks(Id seasonId) {
    Set<Id> result = new Set<Id>();
    for (
      SetupGuesses.Guess guess : SeasonSetupController.getSeasonSetup(seasonId)
        .guesses
    ) {
      if (guess.field == 'periods') {
        result.add(guess.recordId);
      }
    }
    return result;
  }

  @IsTest
  static void undoTakesAwayTheSetsOfferingsAndLinkedChoicesUnlessAPeriodWasAddedByHand() {
    Map<String, Id> kept = KeptCamp.keptIds();
    System.runAs(scheduler(kept)) {
      Season__c season = keptSeason(kept);
      ImportSetupSaves.Result result = save(planWithElectives(season));
      List<LinkedChoice__c> linked = linkedChoices(season.Id);
      // A period added by hand to Hiking's linked choice: it, its offering and its set stay.
      TimeBlock__c lunch = [
        SELECT Id
        FROM TimeBlock__c
        WHERE Program__r.Season__c = :season.Id AND Name = 'Lunch'
        WITH USER_MODE
      ];
      insert as user new LinkedChoiceTime__c(
        LinkedChoice__c = linked[1].Id,
        Weekday__c = 'Thursday',
        TimeBlock__c = lunch.Id
      );
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      List<LinkedChoice__c> left = linkedChoices(season.Id);
      Assert.areEqual(1, left.size(), 'Fishing removed, Hiking kept');
      Assert.areEqual('Hiking', left[0].Name);
      Assert.isTrue(
        undone.keptInUse.contains('Hiking'),
        'kept: ' + undone.keptInUse
      );
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM Offering__c
          WHERE ElectiveSet__r.Season__c = :season.Id
          WITH USER_MODE
        ],
        'Hiking stays offered'
      );
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM ElectiveSet__c
          WHERE Season__c = :season.Id
          WITH USER_MODE
        ]
      );
    }
  }

  @IsTest
  static void undoTakesAwayEverythingItAdded() {
    Map<String, Id> kept = KeptCamp.keptIds();
    System.runAs(scheduler(kept)) {
      Season__c season = keptSeason(kept);
      ImportSetupSaves.Result result = save(planWithElectives(season));
      Test.startTest();
      ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM ElectiveSet__c
          WHERE Season__c = :season.Id
          WITH USER_MODE
        ]
      );
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM LinkedChoiceTime__c
          WHERE LinkedChoice__r.ElectiveSet__r.Season__c = :season.Id
          WITH USER_MODE
        ]
      );
    }
  }

  @IsTest
  static void aDeletedLinkedChoiceIsRememberedByWhatItLinks() {
    Map<String, Id> kept = KeptCamp.keptIds();
    System.runAs(scheduler(kept)) {
      Season__c season = keptSeason(kept);
      save(planWithElectives(season));
      List<LinkedChoice__c> linked = linkedChoices(season.Id);
      Test.startTest();
      SeasonSetupController.deleteRecord(linked[1].Id);
      Test.stopTest();
      Map<String, String> answers = new Map<String, String>();
      for (
        ImportAnswers.Answer row : ImportController.getAnswers(season.Camp__c)
      ) {
        answers.put(row.key, row.answer);
      }
      Assert.areEqual(
        'deleted',
        answers.get(
          'deleted|LinkedChoice|Chugim|Hiking|Tuesday|Period 1+Period 2'
        ),
        'answers: ' + answers.keySet()
      );
    }
  }

  @IsTest
  static void refusesAnElectiveEntryThatNamesARecord() {
    Map<String, Id> kept = KeptCamp.keptIds();
    System.runAs(scheduler(kept)) {
      Season__c season = keptSeason(kept);
      Map<String, Object> plan = planWithElectives(season);
      ((Map<String, Object>) ((List<Object>) plan.get('electiveSets'))[0])
        .put('id', season.Id);
      Test.startTest();
      try {
        save(plan);
        Assert.fail('an elective set is only ever added');
      } catch (AuraHandledException e) {
        Assert.isNotNull(e.getMessage());
      }
      Test.stopTest();
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Program__c
          WHERE Season__c = :season.Id
          WITH USER_MODE
        ],
        'nothing saved'
      );
    }
  }
}
