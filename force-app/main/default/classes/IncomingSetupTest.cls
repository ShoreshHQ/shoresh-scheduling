/**
 * division, group and activity, coming in (IncomingDivision, IncomingGroup, IncomingActivity;
 * docs/protocol/api.md). Each batch is sent as a user holding only that capability's permission
 * set; Undo is a director's. Camp Willow's Summer 2026 has program Main, division Juniors, and
 * groups Group A and Group B (ShoreshTestData.fullSeason). Synthetic data only.
 */
@IsTest
private class IncomingSetupTest {
  private static Map<String, Object> send(
    String address,
    List<Map<String, Object>> records
  ) {
    for (Map<String, Object> record : records) {
      record.put('season', 'Summer 2026');
      record.put('source_system', IncomingTestData.SYSTEM_NAME);
    }
    return IncomingTestData.post(
      address,
      JSON.serialize(new Map<String, Object>{ 'records' => records })
    );
  }

  private static Map<String, Object> one(String field, String value) {
    return new Map<String, Object>{ field => value };
  }

  // API-2.3, 2.5, 6.3: a division Shoresh doesn't have is added in the season's only program;
  // one it has is left as it is; the same batch again changes nothing and records nothing.
  @IsTest
  static void divisionsAreAddedAndTheSameAgainChangeNothing() {
    IncomingTestData camp = new IncomingTestData();
    List<Map<String, Object>> records = new List<Map<String, Object>>{
      one('division_name', 'Seniors'),
      one('division_name', 'juniors')
    };
    System.runAs(camp.sender('Send_Divisions')) {
      Map<String, Object> answer = send('division', records);
      Assert.areEqual('saved: Added.', IncomingTestData.said(answer, 1));
      Assert.areEqual(
        'unchanged: Already in Shoresh.',
        IncomingTestData.said(answer, 2)
      );
      Assert.areEqual(
        'unchanged: Already in Shoresh.',
        IncomingTestData.said(send('division', records), 1)
      );
    }
    Division__c seniors = [
      SELECT Program__c, SortOrder__c
      FROM Division__c
      WHERE Name = 'Seniors'
      WITH SYSTEM_MODE
    ];
    Assert.areEqual(camp.ids.get('Main'), seniors.Program__c);
    Assert.areEqual(1, camp.imports().size());
    Assert.areEqual('Divisions from Sign-up Form', camp.imports()[0].Files__c);
  }

  // API-1.3: the Flow action and the web address give the same result.
  @IsTest
  static void aFlowActionAndTheWebAddressGiveTheSameResult() {
    IncomingTestData camp = new IncomingTestData();
    System.runAs(camp.sender('Send_Activities')) {
      IncomingActivity.Record byFlow = new IncomingActivity.Record();
      byFlow.season = 'Summer 2026';
      byFlow.source_system = IncomingTestData.SYSTEM_NAME;
      byFlow.activity_name = 'Archery';
      Assert.areEqual(
        IncomingTestData.said(
          send(
            'activity',
            new List<Map<String, Object>>{ one('activity_name', 'Swim') }
          ),
          1
        ),
        IncomingTestData.said(
          IncomingActivity.activity(
            new List<IncomingActivity.Record>{ byFlow }
          ),
          1
        )
      );
      Assert.areEqual(
        'unchanged: Already in Shoresh.',
        IncomingTestData.said(
          IncomingActivity.activity(
            new List<IncomingActivity.Record>{ byFlow }
          ),
          1
        )
      );
    }
    Assert.areEqual(
      2,
      [
        SELECT COUNT()
        FROM Activity__c
        WHERE Season__c = :camp.season.Id
        WITH SYSTEM_MODE
      ]
    );
  }

  // API-4.1, API-6.1: a group the other system puts in another division than Shoresh has it is not
  // moved; a person is asked on Roots. A new group is added in the division named.
  @IsTest
  static void aGroupElsewhereIsAskedAboutNeverMoved() {
    IncomingTestData camp = new IncomingTestData();
    Id seniors = ShoreshTestData.division(camp.ids.get('Main'), 'Seniors').Id;
    System.runAs(camp.sender('Send_Groups')) {
      Map<String, Object> moved = one('group_name', 'Group A');
      moved.put('division', 'Seniors');
      Map<String, Object> fresh = one('group_name', 'Bunk 3');
      fresh.put('division', 'Seniors');
      Map<String, Object> answer = send(
        'group',
        new List<Map<String, Object>>{ moved, fresh }
      );
      Assert.areEqual(
        'unchanged: Shoresh has this in another division. It was not moved; a person is asked on Roots.',
        IncomingTestData.said(answer, 1)
      );
      Assert.areEqual('saved: Added.', IncomingTestData.said(answer, 2));
    }
    Assert.areEqual(
      camp.ids.get('Juniors'),
      [
        SELECT Division__c
        FROM Group__c
        WHERE Id = :camp.ids.get('Group A')
        WITH SYSTEM_MODE
      ]
      .Division__c
    );
    Assert.areEqual(
      seniors,
      [SELECT Division__c FROM Group__c WHERE Name = 'Bunk 3' WITH SYSTEM_MODE]
      .Division__c
    );
    Map<String, Object> question = (Map<String, Object>) ((List<Object>) JSON.deserializeUntyped(
      camp.imports()[0].Open__c
    ))[0];
    Assert.areEqual(
      'incoming|group|' + camp.ids.get('Group A'),
      question.get('key')
    );
  }

  // API-6.3: a division Shoresh doesn't have, or no division named when there are two, is a
  // problem said plainly.
  @IsTest
  static void anUnknownOrMissingDivisionIsAProblem() {
    IncomingTestData camp = new IncomingTestData();
    ShoreshTestData.division(camp.ids.get('Main'), 'Seniors');
    System.runAs(camp.sender('Send_Groups')) {
      Map<String, Object> unknown = one('group_name', 'Bunk 3');
      unknown.put('division', 'Middlers');
      Map<String, Object> answer = send(
        'group',
        new List<Map<String, Object>>{ unknown, one('group_name', 'Bunk 4') }
      );
      Assert.areEqual(
        'problem: There is no division called "Middlers" in this season.',
        IncomingTestData.said(answer, 1)
      );
      Assert.areEqual(
        'problem: Say which division (division).',
        IncomingTestData.said(answer, 2)
      );
    }
    Assert.areEqual(0, camp.imports().size());
  }

  // API-2.3, 4.3: Undo last import takes away what a batch added; nothing is deleted otherwise.
  @IsTest
  static void undoTakesAwayWhatABatchAdded() {
    IncomingTestData camp = new IncomingTestData();
    System.runAs(camp.sender('Send_Activities')) {
      send(
        'activity',
        new List<Map<String, Object>>{ one('activity_name', 'Archery') }
      );
    }
    System.runAs(camp.sender('Shoresh_Scheduler')) {
      Assert.areEqual(1, ImportUndo.undo(camp.imports()[0].Id).removed);
    }
    Assert.areEqual(
      0,
      [
        SELECT COUNT()
        FROM Activity__c
        WHERE Season__c = :camp.season.Id
        WITH SYSTEM_MODE
      ]
    );
  }

  // API-4.9: the name a system first sent for a record a person has renamed adds nothing and
  // changes nothing: it is shown to a person. A name it never sent is still added.
  @IsTest
  static void anOldNameAfterAPersonsRenameIsAConflictNeverASecondRecord() {
    IncomingTestData camp = new IncomingTestData();
    System.runAs(camp.sender('Send_Activities')) {
      send(
        'activity',
        new List<Map<String, Object>>{ one('activity_name', 'Kayak') }
      );
    }
    Activity__c sent = [
      SELECT Id
      FROM Activity__c
      WHERE Season__c = :camp.season.Id AND Name = 'Kayak'
      WITH SYSTEM_MODE
    ];
    System.runAs(camp.sender('Shoresh_Scheduler')) {
      Database.update(
        new Activity__c(Id = sent.Id, Name = 'Kayaking'),
        AccessLevel.USER_MODE
      );
    }
    Map<String, Object> answer;
    System.runAs(camp.sender('Send_Activities')) {
      answer = send(
        'activity',
        new List<Map<String, Object>>{
          one('activity_name', 'Kayak'),
          one('activity_name', 'Canoe')
        }
      );
    }
    String body = JSON.serialize(answer);
    Assert.isTrue(body.contains('A person renamed'), body);
    Assert.areEqual(
      new List<String>{ 'Canoe', 'Kayaking' },
      namesIn(camp),
      'Kayaking stands, no second Kayak; Canoe is new'
    );
    Assert.isTrue(camp.imports()[0].Open__c.contains('Kayaking'));
  }

  private static List<String> namesIn(IncomingTestData camp) {
    List<String> names = new List<String>();
    for (Activity__c activity : [
      SELECT Name
      FROM Activity__c
      WHERE Season__c = :camp.season.Id
      WITH SYSTEM_MODE
      ORDER BY Name
    ]) {
      names.add(activity.Name);
    }
    return names;
  }

  // API-4.4: each capability needs its own permission set.
  @IsTest
  static void eachNeedsItsOwnPermissionSet() {
    IncomingTestData camp = new IncomingTestData();
    System.runAs(camp.sender('Send_Activities')) {
      Map<String, Object> answer = send(
        'division',
        new List<Map<String, Object>>{ one('division_name', 'Seniors') }
      );
      Assert.areEqual(403, answer.get('status'));
      Assert.areEqual(
        'This user can\'t send divisions. A Salesforce admin can give it the "Send divisions" permission set.',
        answer.get('message')
      );
      Assert.areEqual(
        403,
        send(
            'group',
            new List<Map<String, Object>>{ one('group_name', 'Bunk 3') }
          )
          .get('status')
      );
    }
  }

  /** A capability that refuses as a screen check does: the problem, then the screen's advice. */
  private class Refusing implements IncomingBatch.Capability {
    public String permissionSet() {
      return 'Send_Groups';
    }
    public String permissionLabel() {
      return 'Send groups';
    }
    public String what() {
      return 'Groups';
    }
    public String seasonOf(Object record) {
      return ((IncomingGroup.Record) record).season;
    }
    public String systemOf(Object record) {
      return ((IncomingGroup.Record) record).source_system;
    }
    public void plan(IncomingBatch batch, List<Object> records) {
      throw new ShoreshException(
        AgentRefusal.withFix(
          '"Bunk 5" doesn\'t fit in the Dining hall at Lunch.',
          'Change "Lunch" first, then try again.'
        )
      );
    }
  }

  /** One batch through the web address as that user, refused by Refusing; its answer. */
  private static Map<String, Object> refusedAs(User user) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(
      JSON.serialize(
        new Map<String, Object>{
          'records' => new List<Object>{
            new Map<String, Object>{
              'season' => 'Summer 2026',
              'source_system' => IncomingTestData.SYSTEM_NAME
            }
          }
        }
      )
    );
    RestContext.response = new RestResponse();
    System.runAs(user) {
      IncomingDoors.byWeb(
        new Refusing(),
        IncomingGroup.Record.class,
        new Set<String>{ 'season', 'source_system' }
      );
    }
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    Assert.areEqual(
      400,
      RestContext.response.statusCode,
      String.valueOf(answer)
    );
    Assert.isFalse(AgentRefusal.forAgent, 'set back after the web address');
    return answer;
  }

  // API-1.105: a person's AI (Shoresh Scheduler) hears the problem, not the screen's advice.
  @IsTest
  static void aPersonsAiHearsTheProblemWithoutTheScreensAdvice() {
    IncomingTestData camp = new IncomingTestData();
    Assert.areEqual(
      '"Bunk 5" doesn\'t fit in the Dining hall at Lunch.',
      refusedAs(camp.sender('Shoresh_Scheduler')).get('message')
    );
  }

  // API-6.4: a key (only the capability's permission set) keeps the next step.
  @IsTest
  static void aKeyKeepsTheNextStep() {
    IncomingTestData camp = new IncomingTestData();
    Assert.areEqual(
      '"Bunk 5" doesn\'t fit in the Dining hall at Lunch. Change "Lunch" first, then try again.',
      refusedAs(camp.sender('Send_Groups')).get('message')
    );
  }
}
