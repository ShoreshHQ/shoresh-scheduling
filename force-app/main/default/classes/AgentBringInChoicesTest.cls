/**
 * bring_in_choices through an agent (docs/protocol/api.md API-1.117): what the screen reads, its
 * own check (nothing saved) and its own Bring in, which starts the week's run. As a scheduler with
 * only Shoresh Scheduler, records made inside the same runAs. Made-up names only.
 */
@IsTest
private class AgentBringInChoicesTest {
  /** One camper choosing Archery, for Week 1 of the set and schedule given (ids by name). */
  private static Map<String, Object> request(Map<String, Id> ids) {
    ChoicesImport.SheetChoice archery = new ChoicesImport.SheetChoice();
    archery.n = 'Archery';
    archery.a = ids.get('Archery');
    archery.r = 1;
    archery.k = 'ranked';
    ChoicesImport.SheetCamper maya = new ChoicesImport.SheetCamper();
    maya.row = 2;
    maya.name = 'Maya Fernwood';
    maya.camperNumber = '1001';
    maya.choices = new List<ChoicesImport.SheetChoice>{ archery };
    ChoicesImport.Request result = new ChoicesImport.Request();
    result.seasonId = ids.get('Season');
    result.electiveSetId = ids.get('Chugim');
    result.weekId = ids.get('Week 1');
    result.scheduleId = ids.get('Schedule');
    result.fileName = 'chugim.csv';
    result.campers.add(maya);
    return (Map<String, Object>) JSON.deserializeUntyped(
      JSON.serialize(result)
    );
  }

  private static List<Object> send(String method, Map<String, Object> body) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = method;
    if (method == 'GET') {
      RestContext.request.params.putAll(
        (Map<String, String>) JSON.deserialize(
          JSON.serialize(body),
          Map<String, String>.class
        )
      );
    } else {
      RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    }
    RestContext.response = new RestResponse();
    if (method == 'GET') {
      AgentBringInChoices.get();
    } else {
      AgentBringInChoices.post();
    }
    return new List<Object>{
      RestContext.response.statusCode,
      JSON.deserializeUntyped(RestContext.response.responseBody.toString())
    };
  }

  // API-1.117: the screen's reads, its check (nothing saved), then its Bring in, which starts the run.
  @IsTest
  static void aChoicesFileStartsTheWeeksElectivesAsTheScreenDoes() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Map<String, Id> ids = ShoreshTestData.lastSeasonIds.clone();
      Activity__c archery = ShoreshTestData.activity(
        season.Id,
        'Archery',
        null
      );
      Database.insert(archery, AccessLevel.USER_MODE);
      ids.put('Archery', archery.Id);
      ElectiveSet__c chugim = new ElectiveSet__c(
        Season__c = season.Id,
        Name = 'Chugim'
      );
      Database.insert(chugim, AccessLevel.USER_MODE);
      Database.insert(
        new Offering__c(
          ElectiveSet__c = chugim.Id,
          Activity__c = archery.Id,
          Seats__c = 12
        ),
        AccessLevel.USER_MODE
      );
      // The week's current schedule, a Manual Build draft: never a saved version (ELECT-2.5).
      Schedule__c schedule = new Schedule__c(
        Program__c = ids.get('Main'),
        Week__c = ids.get('Week 1'),
        Name = 'Week 1 draft',
        Status__c = 'Draft',
        Origin__c = 'Manual'
      );
      Database.insert(schedule, AccessLevel.SYSTEM_MODE);
      String name = [SELECT Name FROM Season__c WHERE Id = :season.Id].Name;
      ids.put('Season', season.Id);
      ids.put('Chugim', chugim.Id);
      ids.put('Schedule', schedule.Id);
      Map<String, Object> asked = request(ids);

      Test.startTest();
      List<Object> read = send(
        'GET',
        new Map<String, Object>{ 'season' => name }
      );
      List<Object> checked = send(
        'POST',
        new Map<String, Object>{ 'season' => name, 'request' => asked }
      );
      Integer runsAfterCheck = [
        SELECT COUNT()
        FROM ElectiveRun__c
        WHERE ElectiveSet__c = :chugim.Id
      ];
      List<Object> saved = send(
        'POST',
        new Map<String, Object>{
          'season' => name,
          'request' => asked,
          'save' => true
        }
      );
      Test.stopTest();

      Assert.areEqual(200, read[0], String.valueOf(read[1]));
      Map<String, Object> situation = (Map<String, Object>) ((Map<String, Object>) read[1])
        .get('situation');
      Assert.areEqual(1, ((List<Object>) situation.get('sets')).size());
      Assert.areEqual(200, checked[0], String.valueOf(checked[1]));
      Map<String, Object> check = (Map<String, Object>) JSON.deserializeUntyped(
        (String) ((Map<String, Object>) checked[1]).get('message')
      );
      Assert.areEqual(1, check.get('added'));
      Assert.areEqual(0, runsAfterCheck, 'a check saves nothing');
      Assert.areEqual(200, saved[0], String.valueOf(saved[1]));
      ElectiveRun__c run = [
        SELECT Status__c, Week__c
        FROM ElectiveRun__c
        WHERE ElectiveSet__c = :chugim.Id
      ];
      Assert.areEqual('Committed', run.Status__c);
      Assert.areEqual(ids.get('Week 1'), run.Week__c);
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Preference__c WHERE ElectiveRun__c = :run.Id]
      );
    }
  }

  // API-1.117: a request for another season than the one named is refused, nothing saved.
  @IsTest
  static void aRequestForAnotherSeasonIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      String name = [SELECT Name FROM Season__c WHERE Id = :season.Id].Name;
      Test.startTest();
      List<Object> refused = send(
        'POST',
        new Map<String, Object>{
          'season' => name,
          'request' => new Map<String, Object>{ 'seasonId' => camp.Id },
          'save' => true
        }
      );
      Test.stopTest();
      Assert.areEqual(400, refused[0], String.valueOf(refused[1]));
      Assert.areEqual(
        'That request is for another season.',
        ((Map<String, Object>) refused[1]).get('message')
      );
    }
  }
}
