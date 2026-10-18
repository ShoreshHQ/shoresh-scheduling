/**
 * A rain plan has to be indoors (Shoresh desktop ActivitiesScreen.jsx save()): refused with the
 * desktop's words wherever it is chosen, and only where it is chosen or changed. Synthetic camp.
 */
@IsTest
private class RainPlanIndoorsTest {
  private static Map<String, Id> camp() {
    Camp__c camp = ShoreshTestData.camp('Test Camp');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
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
    System.runAs(ShoreshTestData.scheduler()) {
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
    System.runAs(ShoreshTestData.scheduler()) {
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
    System.runAs(ShoreshTestData.scheduler()) {
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
    System.runAs(ShoreshTestData.scheduler()) {
      SeasonSetupController.saveRecords(
        new List<SObject>{
          new Activity__c(
            Id = ids.get('Soccer'),
            RainPlan__c = ids.get('Swim')
          )
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
  static void otherChangesToARowWhoseRainPlanWentOutdoorsStillSave() {
    Map<String, Id> ids = camp();
    System.runAs(ShoreshTestData.scheduler()) {
      // Gym games goes outdoors; Soccer's rain plan is unchanged, so its notes still save (the
      // screen shows the rain plan as one to choose again).
      SeasonSetupController.saveRecords(
        new List<SObject>{
          new Activity__c(Id = ids.get('Gym games'), Outdoor__c = true)
        }
      );
      SeasonSetupController.saveRecords(
        new List<SObject>{
          new Activity__c(Id = ids.get('Soccer'), Notes__c = 'Bring cones')
        }
      );
    }
    Assert.areEqual(
      'Bring cones',
      [SELECT Notes__c FROM Activity__c WHERE Id = :ids.get('Soccer')]
      .Notes__c
    );
  }

  @IsTest
  static void theRefusalUsesTheCampsWords() {
    Map<String, Id> ids = camp();
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
    System.runAs(ShoreshTestData.scheduler()) {
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
