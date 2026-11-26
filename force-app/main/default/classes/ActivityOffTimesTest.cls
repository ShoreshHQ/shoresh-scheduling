/**
 * When an activity can run (ADR 0031 piece A): the details panel's When it runs saved whole
 * (ActivitiesController.saveWhenItRuns), only while it is as the director saw it; a box that isn't
 * a day and time block of the season refused; every screen reading it with the activity; and Copy
 * season carrying it to the copied time blocks. Synthetic data only.
 */
@IsTest
private class ActivityOffTimesTest {
  @TestSetup
  static void setup() {
    User scheduler = ShoreshTestData.scheduler();
    Map<String, Id> ids = new Map<String, Id>();
    System.runAs(scheduler) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      ids.putAll(ShoreshTestData.placesAndActivities(season.Id));
      ids.put('Season', season.Id);
      ids.put('Camp', camp.Id);
    }
    ids.put('Scheduler', scheduler.Id);
    KeptCamp.keepIds(ids);
  }

  private static Id blockNamed(Id seasonId, String name) {
    return [
      SELECT Id
      FROM TimeBlock__c
      WHERE Name = :name AND Program__r.Season__c = :seasonId
      WITH SYSTEM_MODE
    ]
    .Id;
  }

  private static List<ActivityOffTime__c> offTimesOf(Id activityId) {
    return [
      SELECT TimeBlock__c, Day__c
      FROM ActivityOffTime__c
      WHERE Activity__c = :activityId
      WITH SYSTEM_MODE
      ORDER BY Day__c
    ];
  }

  private static String refusal(Id activityId, List<String> boxes) {
    try {
      ActivitiesController.saveWhenItRuns(
        activityId,
        boxes,
        ActivityOffTimes.now(activityId)
      );
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    return null;
  }

  // GEN-3.17
  @IsTest
  static void whenItRunsIsSavedWholeAndEveryScreenReadsItWithTheActivity() {
    Map<String, Id> ids = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(ids)) {
      Id swim = ids.get('Swim');
      String lunchMonday = ActivityOffTimes.key(
        blockNamed(ids.get('Season'), 'Lunch'),
        'Monday'
      );
      String lunchTuesday = ActivityOffTimes.key(
        blockNamed(ids.get('Season'), 'Lunch'),
        'Tuesday'
      );
      Test.startTest();
      RowSaves.Result saved = ActivitiesController.saveWhenItRuns(
        swim,
        new List<String>{ lunchMonday, lunchMonday, lunchTuesday },
        new List<String>()
      );
      Assert.isTrue(saved.saved());
      Assert.areEqual(2, offTimesOf(swim).size(), 'Each box once');
      Activity__c read;
      for (
        Activity__c activity : SeasonSetupReader.activitiesOf(ids.get('Season'))
      ) {
        if (activity.Id == swim) {
          read = activity;
        }
      }
      Assert.areEqual(
        new Set<String>{ lunchMonday, lunchTuesday },
        ActivityOffTimes.of(read)
      );
      Assert.isFalse(
        ActivityOffTimes.runs(
          read,
          blockNamed(ids.get('Season'), 'Lunch'),
          Date.newInstance(2026, 6, 29)
        ),
        '2026-06-29 is a Monday'
      );
      // Every box ticked again: nothing stored, so it runs whenever its groups are at camp.
      ActivitiesController.saveWhenItRuns(
        swim,
        new List<String>(),
        new List<String>{ lunchTuesday, lunchMonday }
      );
      Test.stopTest();
      Assert.areEqual(0, offTimesOf(swim).size());
    }
  }

  // GEN-3.17, API-1.103
  @IsTest
  static void someoneElsesChangeSinceIsAnsweredNeverOverwritten() {
    Map<String, Id> ids = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(ids)) {
      Id swim = ids.get('Swim');
      Id lunch = blockNamed(ids.get('Season'), 'Lunch');
      String theirs = ActivityOffTimes.key(lunch, 'Monday');
      String yours = ActivityOffTimes.key(lunch, 'Tuesday');
      ActivitiesController.saveWhenItRuns(
        swim,
        new List<String>{ theirs },
        new List<String>()
      );
      Test.startTest();
      RowSaves.Result answer = ActivitiesController.saveWhenItRuns(
        swim,
        new List<String>{ yours },
        new List<String>()
      );
      Assert.isFalse(answer.saved());
      Assert.areEqual(new List<String>{ theirs }, answer.theirOffTimes);
      Assert.areEqual('Monday', offTimesOf(swim)[0].Day__c, 'Theirs stays');
      // Choosing what someone else already chose is no question.
      Assert.isTrue(
        ActivitiesController.saveWhenItRuns(
            swim,
            new List<String>{ theirs },
            new List<String>()
          )
          .saved()
      );
      Test.stopTest();
    }
  }

  // GEN-3.17
  @IsTest
  static void aBoxThatIsNotADayAndTimeBlockOfTheSeasonIsRefused() {
    Map<String, Id> ids = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(ids)) {
      Id swim = ids.get('Swim');
      Id lunch = blockNamed(ids.get('Season'), 'Lunch');
      String notOne = 'When it runs can only name days and time blocks of this season.';
      Test.startTest();
      Assert.areEqual(
        notOne,
        refusal(swim, new List<String>{ lunch + '|Funday' })
      );
      Assert.areEqual(
        notOne,
        refusal(swim, new List<String>{ ids.get('Pool') + '|Monday' })
      );
      Assert.areEqual(notOne, refusal(swim, new List<String>{ 'x|Monday' }));
      Season__c other = ShoreshTestData.fullSeason(ids.get('Camp'));
      String otherSeason = refusal(
        swim,
        new List<String>{ blockNamed(other.Id, 'Lunch') + '|Monday' }
      );
      Test.stopTest();
      Assert.isTrue(
        otherSeason.contains('belongs to a different'),
        otherSeason
      );
      Assert.areEqual(0, offTimesOf(swim).size(), 'Nothing saved');
    }
  }

  // API-1.105: a save without what was seen is refused, never read in its place.
  @IsTest
  static void aSaveWithoutWhatWasSeenIsRefused() {
    Map<String, Id> ids = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(ids)) {
      String message;
      Test.startTest();
      try {
        ActivitiesController.saveWhenItRuns(
          ids.get('Swim'),
          new List<String>(),
          null
        );
      } catch (AuraHandledException e) {
        message = e.getMessage();
      }
      Test.stopTest();
      Assert.isTrue(message.startsWith('When it runs wasn'), message);
    }
  }

  // ADR 0031 A7
  @IsTest
  static void copySeasonCarriesWhenItRunsToTheCopiedTimeBlocks() {
    Map<String, Id> ids = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(ids)) {
      Id lunch = blockNamed(ids.get('Season'), 'Lunch');
      ActivitiesController.saveWhenItRuns(
        ids.get('Swim'),
        new List<String>{ ActivityOffTimes.key(lunch, 'Wednesday') },
        new List<String>()
      );
      Test.startTest();
      Id copyId = new SeasonCopier(
          ids.get('Season'),
          Date.newInstance(2027, 6, 28)
        )
        .copy('Summer 2027');
      Test.stopTest();
      List<ActivityOffTime__c> copied = [
        SELECT TimeBlock__c, TimeBlock__r.CopiedFrom__c, Day__c
        FROM ActivityOffTime__c
        WHERE Activity__r.Season__c = :copyId
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(1, copied.size());
      Assert.areEqual(lunch, copied[0].TimeBlock__r.CopiedFrom__c);
      Assert.areEqual('Wednesday', copied[0].Day__c);
    }
  }
}
