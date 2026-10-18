/**
 * A rain plan has to be indoors (Shoresh desktop ActivitiesScreen.jsx save()): an activity whose
 * rain plan is outdoors is refused with the desktop's words, from a screen or a list import; a
 * season copy keeps rain plans as they were. Synthetic camp.
 */
@IsTest
private class RainPlanIndoorsTest {
  // The camp is built once for the class (setup) and read back in each test (camp()).
  @TestSetup
  static void setup() {
    User scheduler = ShoreshTestData.scheduler();
    Map<String, Id> ids;
    System.runAs(scheduler) {
      ids = build();
    }
    ids.put('Scheduler', scheduler.Id);
    ShoreshTestData.keepIds(ids);
  }

  /** The camp setup built. */
  private static Map<String, Id> camp() {
    return ShoreshTestData.keptIds();
  }

  /** The scheduler setup built the camp as. */
  private static User scheduler(Map<String, Id> ids) {
    return new User(Id = ids.get('Scheduler'));
  }

  private static Map<String, Id> build() {
    Camp__c camp = ShoreshTestData.camp('Test Camp');
    Season__c season = ShoreshTestData.fullSeason(camp.Id);
    // Swim (indoors), Soccer (outdoors, rain plan Gym games), Gym games (indoors).
    Map<String, Id> ids = ShoreshTestData.placesAndActivities(season.Id);
    ids.put('Season', season.Id);
    return ids;
  }

  private static String refusal(List<SObject> records) {
    try {
      SeasonSetupController.saveRecords(records);
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    return null;
  }

  @IsTest
  static void anOutdoorRainPlanIsRefusedWithTheDesktopsWords() {
    Map<String, Id> ids = camp();
    // The scheduler made the camp in setup, so it is theirs to see under sharing.
    User scheduler = scheduler(ids);
    System.runAs(scheduler) {
      String message = refusal(
        new List<SObject>{
          new Activity__c(Id = ids.get('Swim'), RainPlan__c = ids.get('Soccer'))
        }
      );
      Assert.areEqual(
        '"Swim": The rain plan has to be indoors. Pick an indoor one, or choose None.',
        message
      );
    }
    Assert.isNull(
      [SELECT RainPlan__c FROM Activity__c WHERE Id = :ids.get('Swim')]
      .RainPlan__c
    );
  }

  @IsTest
  static void aNewActivityWithAnOutdoorRainPlanIsRefused() {
    Map<String, Id> ids = camp();
    // The scheduler made the camp in setup, so it is theirs to see under sharing.
    User scheduler = scheduler(ids);
    System.runAs(scheduler) {
      Activity__c hike = ShoreshTestData.activity(
        ids.get('Season'),
        'Hike',
        null
      );
      hike.Outdoor__c = true;
      hike.RainPlan__c = ids.get('Soccer');
      Assert.isTrue(
        refusal(new List<SObject>{ hike }).contains('has to be indoors')
      );
    }
  }

  @IsTest
  static void aRainPlanMadeOutdoorInTheSameSaveIsRefused() {
    Map<String, Id> ids = camp();
    // The scheduler made the camp in setup, so it is theirs to see under sharing.
    User scheduler = scheduler(ids);
    System.runAs(scheduler) {
      String message = refusal(
        new List<SObject>{
          new Activity__c(Id = ids.get('Swim'), Outdoor__c = true),
          new Activity__c(
            Id = ids.get('Gym games'),
            RainPlan__c = ids.get('Swim')
          )
        }
      );
      Assert.isTrue(message.contains('has to be indoors'), message);
    }
  }

  @IsTest
  static void anIndoorRainPlanSaves() {
    Map<String, Id> ids = camp();
    // The scheduler made the camp in setup, so it is theirs to see under sharing.
    User scheduler = scheduler(ids);
    System.runAs(scheduler) {
      SeasonSetupController.saveRecords(
        new List<SObject>{
          new Activity__c(Id = ids.get('Soccer'), RainPlan__c = ids.get('Swim'))
        }
      );
    }
    Assert.areEqual(
      ids.get('Swim'),
      [SELECT RainPlan__c FROM Activity__c WHERE Id = :ids.get('Soccer')]
      .RainPlan__c
    );
  }

  @IsTest
  static void anActivityWhoseRainPlanWentOutdoorsSavesOnlyOnceItIsChanged() {
    Map<String, Id> ids = camp();
    // The scheduler made the camp in setup, so it is theirs to see under sharing.
    User scheduler = scheduler(ids);
    System.runAs(scheduler) {
      // Making Gym games outdoors is allowed, though it is Soccer's rain plan (as on the desktop).
      SeasonSetupController.saveRecords(
        new List<SObject>{
          new Activity__c(Id = ids.get('Gym games'), Outdoor__c = true)
        }
      );
      // Then any save of Soccer is refused until its rain plan changes (desktop save()).
      String message = refusal(
        new List<SObject>{
          // A field the activities table saves (notes are saved by the details panel).
          new Activity__c(Id = ids.get('Soccer'), Length__c = 2)
        }
      );
      Assert.isTrue(message.contains('has to be indoors'), message);
      SeasonSetupController.saveRecords(
        new List<SObject>{
          new Activity__c(
            Id = ids.get('Soccer'),
            Length__c = 2,
            RainPlan__c = ids.get('Swim')
          )
        }
      );
    }
    Assert.areEqual(
      2,
      [SELECT Length__c FROM Activity__c WHERE Id = :ids.get('Soccer')]
      .Length__c
    );
  }

  @IsTest
  static void anActivityWithAnOutdoorRainPlanCanStillBeUntickedForAWeek() {
    Map<String, Id> ids = camp();
    // The scheduler made the camp in setup, so it is theirs to see under sharing.
    User scheduler = scheduler(ids);
    System.runAs(scheduler) {
      SeasonSetupController.saveRecords(
        new List<SObject>{
          new Activity__c(Id = ids.get('Gym games'), Outdoor__c = true)
        }
      );
      Id week = [
        SELECT Id
        FROM Week__c
        WHERE Season__c = :ids.get('Season')
        ORDER BY StartDate__c
        LIMIT 1
      ]
      .Id;
      Test.startTest();
      // A week tick on Soccer's row, saved as the table saves it (the row itself unchanged).
      SetupTablesController.saveRow(
        new Activity__c(Id = ids.get('Soccer')),
        null,
        SetTimeTestData.extras(
          new List<RunsIn.WeekOff>{
            SetTimeTestData.weekOff(null, ids.get('Soccer'), week)
          },
          new List<Id>(),
          null
        )
      );
      Test.stopTest();
    }
    Assert.areEqual(
      1,
      [
        SELECT COUNT()
        FROM WeekException__c
        WHERE Activity__c = :ids.get('Soccer')
      ],
      'the week is off, though its rain plan is outdoors'
    );
  }

  @IsTest
  static void copyingASeasonKeepsARainPlanMadeOutdoorsSince() {
    Map<String, Id> ids = camp();
    // The scheduler made the camp in setup, so it is theirs to see under sharing.
    User scheduler = scheduler(ids);
    System.runAs(scheduler) {
      SeasonSetupController.saveRecords(
        new List<SObject>{
          new Activity__c(Id = ids.get('Gym games'), Outdoor__c = true)
        }
      );
      Test.startTest();
      Id copyId = SeasonSetupController.copySeason(
        ids.get('Season'),
        'Summer 2027',
        Date.newInstance(2027, 6, 28)
      );
      Test.stopTest();
      Activity__c soccer = [
        SELECT RainPlan__r.Name
        FROM Activity__c
        WHERE Season__c = :copyId AND Name = 'Soccer'
      ];
      Assert.areEqual('Gym games', soccer.RainPlan__r.Name);
    }
  }

  @IsTest
  static void aListImportGivingAnOutdoorRainPlanIsRefusedAndNothingIsSaved() {
    Map<String, Id> ids = camp();
    // The scheduler made the camp in setup, so it is theirs to see under sharing.
    User scheduler = scheduler(ids);
    System.runAs(scheduler) {
      Map<String, Object> plan = new Map<String, Object>{
        'seasonId' => ids.get('Season'),
        'screen' => 'activities',
        'files' => 'activities.csv (Activities)',
        'records' => new List<Object>{
          new Map<String, Object>{
            'kind' => 'Activity',
            'id' => ids.get('Swim'),
            'fields' => new Map<String, Object>{ 'Notes__c' => 'Goggles' },
            'refs' => new Map<String, Object>{
              'RainPlan__c' => ids.get('Soccer')
            }
          }
        },
        'remember' => new List<Object>(),
        'forget' => new List<Object>()
      };
      try {
        ImportController.saveList(JSON.serialize(plan));
        Assert.fail('An outdoor rain plan was imported.');
      } catch (AuraHandledException e) {
        Assert.isTrue(
          e.getMessage().contains('has to be indoors'),
          e.getMessage()
        );
      }
    }
    Activity__c swim = [
      SELECT RainPlan__c, Notes__c
      FROM Activity__c
      WHERE Id = :ids.get('Swim')
    ];
    Assert.isNull(swim.RainPlan__c);
    Assert.isNull(swim.Notes__c);
  }

  @IsTest
  static void theRefusalUsesTheCampsWords() {
    Map<String, Id> ids = camp();
    User scheduler = scheduler(ids);
    Id campId = [SELECT Camp__c FROM Season__c WHERE Id = :ids.get('Season')]
    .Camp__c;
    Database.insert(
      new CampLabel__c(
        Camp__c = campId,
        ModelTerm__c = 'RainPlan',
        Singular__c = 'Wet-weather swap',
        Plural__c = 'Wet-weather swaps'
      ),
      AccessLevel.SYSTEM_MODE
    );
    System.runAs(scheduler) {
      String message = refusal(
        new List<SObject>{
          new Activity__c(Id = ids.get('Swim'), RainPlan__c = ids.get('Soccer'))
        }
      );
      Assert.isTrue(
        message.contains('The Wet-weather swap has to be indoors.'),
        message
      );
    }
  }
}
