/**
 * A camp for incoming-batch tests (IncomingCamperTest and the others): Camp Willow's Summer 2026
 * (ShoreshTestData.fullSeason) with Chugim (Archery, Swim) in Week 1, and a sending user holding
 * one permission set only, shown the season as a camp's sharing rule would. Synthetic data only.
 */
@IsTest
public class IncomingTestData {
  public static final String SYSTEM_NAME = 'Sign-up Form';
  public Season__c season;
  public Map<String, Id> ids;
  public ElectiveRun__c run;

  public IncomingTestData() {
    season = ShoreshTestData.fullSeason(ShoreshTestData.camp('Camp Willow').Id);
    ids = ShoreshTestData.lastSeasonIds.clone();
  }

  /** Chugim in Week 1, offering Archery and Swim. */
  public IncomingTestData withElectives() {
    List<Activity__c> activities = new List<Activity__c>{
      ShoreshTestData.activity(season.Id, 'Archery', null),
      ShoreshTestData.activity(season.Id, 'Swim', null)
    };
    Database.insert(activities, AccessLevel.SYSTEM_MODE);
    ids.put('Archery', activities[0].Id);
    ids.put('Swim', activities[1].Id);
    ElectiveSet__c chugim = new ElectiveSet__c(
      Season__c = season.Id,
      Name = 'Chugim'
    );
    Database.insert(chugim, AccessLevel.SYSTEM_MODE);
    Database.insert(
      new List<Offering__c>{
        new Offering__c(
          ElectiveSet__c = chugim.Id,
          Activity__c = activities[0].Id,
          Seats__c = 10
        ),
        new Offering__c(
          ElectiveSet__c = chugim.Id,
          Activity__c = activities[1].Id,
          Seats__c = 10
        )
      },
      AccessLevel.SYSTEM_MODE
    );
    run = new ElectiveRun__c(
      Season__c = season.Id,
      Name = 'Chugim · Week 1',
      ElectiveSet__c = chugim.Id,
      Week__c = ids.get('Week 1'),
      Schedule__c = ShoreshTestData.version(
          ids.get('Main'),
          ids.get('Week 1'),
          'Imported'
        )
        .Id
    );
    Database.insert(run, AccessLevel.SYSTEM_MODE);
    return this;
  }

  /** A camper already in the season, from the sending system. */
  public Camper__c camper(String name, String outsideId) {
    Camper__c camper = new Camper__c(
      Season__c = season.Id,
      Name = name,
      OutsideId__c = outsideId,
      SourceSystem__c = outsideId == null ? null : SYSTEM_NAME
    );
    Database.insert(camper, AccessLevel.SYSTEM_MODE);
    return camper;
  }

  /** A user holding only this permission set, who can see and work in the season. */
  public User sender(String permissionSet) {
    User user = ShoreshTestData.userWith(permissionSet);
    System.runAs(new User(Id = UserInfo.getUserId())) {
      Database.insert(
        new Season__Share(
          ParentId = season.Id,
          UserOrGroupId = user.Id,
          AccessLevel = 'Edit'
        ),
        AccessLevel.SYSTEM_MODE
      );
    }
    return user;
  }

  /** The web address's answer to this body, as parsed JSON. */
  public static Map<String, Object> post(String address, String body) {
    RestRequest request = new RestRequest();
    request.requestURI = '/services/apexrest/v1/' + address;
    request.httpMethod = 'POST';
    request.requestBody = Blob.valueOf(body);
    RestContext.request = request;
    RestContext.response = new RestResponse();
    switch on address {
      when 'camper' {
        IncomingCamper.post();
      }
      when 'camper_group' {
        IncomingCamperGroup.post();
      }
      when 'division' {
        IncomingDivision.post();
      }
      when 'group' {
        IncomingGroup.post();
      }
      when 'activity' {
        IncomingActivity.post();
      }
      when else {
        IncomingCamperElectiveChoice.post();
      }
    }
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    answer.put('status', RestContext.response.statusCode);
    return answer;
  }

  /** Row n's result and message from a web answer: "saved: Added this camper." */
  public static String said(Map<String, Object> answer, Integer row) {
    Assert.isNotNull(answer.get('records'), String.valueOf(answer));
    Map<String, Object> item = (Map<String, Object>) ((List<Object>) answer.get(
      'records'
    ))[row - 1];
    return item.get('result') + ': ' + item.get('message');
  }

  /** The same from a Flow action's answer. */
  public static String said(List<IncomingResult> answer, Integer row) {
    return answer[row - 1].result + ': ' + answer[row - 1].message;
  }

  /** The season's imports, newest first. */
  public List<Import__c> imports() {
    return [
      SELECT Id, Files__c, Open__c, Created__c, Changed__c
      FROM Import__c
      WHERE Season__c = :season.Id
      WITH SYSTEM_MODE
      ORDER BY CreatedDate DESC, Name DESC
    ];
  }
}
