/**
 * division, group and activity, coming in (IncomingDivision, IncomingGroup, IncomingActivity;
 * docs/protocol/api.md). Each batch is sent as a user holding only that capability's permission
 * set; Undo is a director's. Camp Willow's Summer 2026 has program Main, division Juniors, and
 * groups Group A and Group B (ShoreshTestData.fullSeason). Synthetic data only.
 */
@IsTest
private class IncomingSetupTest {
  // What a division name too long for Salesforce is answered (TooLong).
  private static final String TOO_LONG =
    'problem: Not saved: "' +
    'x'.repeat(81) +
    '": Something typed is too long. Shorten it and save again.';

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

  // API-2.3: a group a batch added can be undone like any import.
  @IsTest
  static void undoTakesAwayAGroupABatchAdded() {
    IncomingTestData camp = new IncomingTestData();
    System.runAs(camp.sender('Send_Groups')) {
      send(
        'group',
        new List<Map<String, Object>>{
          new Map<String, Object>{
            'group_name' => 'Cabin 9',
            'division' => 'Juniors'
          }
        }
      );
    }
    System.runAs(camp.sender('Shoresh_Scheduler')) {
      Assert.areEqual(1, ImportUndo.undo(camp.imports()[0].Id).removed);
    }
  }

  // API-4.9: the same name in another division is a new group, not the renamed one.
  @IsTest
  static void aRenamedGroupsOldNameInAnotherDivisionIsANewGroup() {
    IncomingTestData camp = new IncomingTestData();
    insert new Division__c(Program__c = camp.ids.get('Main'), Name = 'Seniors');
    System.runAs(camp.sender('Send_Groups')) {
      send(
        'group',
        new List<Map<String, Object>>{
          new Map<String, Object>{
            'group_name' => 'Cabin 9',
            'division' => 'Juniors'
          }
        }
      );
    }
    Group__c sent = [
      SELECT Id
      FROM Group__c
      WHERE Name = 'Cabin 9'
      WITH SYSTEM_MODE
    ];
    System.runAs(camp.sender('Shoresh_Scheduler')) {
      Database.update(
        new Group__c(Id = sent.Id, Name = 'Cabin Nine'),
        AccessLevel.USER_MODE
      );
    }
    Map<String, Object> elsewhere;
    Map<String, Object> same;
    System.runAs(camp.sender('Send_Groups')) {
      same = send(
        'group',
        new List<Map<String, Object>>{
          new Map<String, Object>{
            'group_name' => 'Cabin 9',
            'division' => 'Juniors'
          }
        }
      );
      elsewhere = send(
        'group',
        new List<Map<String, Object>>{
          new Map<String, Object>{
            'group_name' => 'Cabin 9',
            'division' => 'Seniors'
          }
        }
      );
    }
    Assert.isTrue(
      JSON.serialize(same).contains('A person renamed'),
      JSON.serialize(same)
    );
    Assert.isFalse(
      JSON.serialize(elsewhere).contains('A person renamed'),
      JSON.serialize(elsewhere)
    );
    Assert.areEqual(
      1,
      [SELECT COUNT() FROM Group__c WHERE Name = 'Cabin 9' WITH SYSTEM_MODE]
    );
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
        'This connection can\'t send divisions. A Salesforce admin can give it the "Send divisions" permission set.',
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

  /** A batch of this many records through the web address as that user; its answer. */
  private static Map<String, Object> throughWeb(
    User user,
    IncomingBatch.Capability capability,
    Integer size
  ) {
    List<Object> records = new List<Object>();
    for (Integer i = 0; i < size; i++) {
      records.add(
        new Map<String, Object>{
          'season' => 'Summer 2026',
          'source_system' => IncomingTestData.SYSTEM_NAME
        }
      );
    }
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(
      JSON.serialize(new Map<String, Object>{ 'records' => records })
    );
    RestContext.response = new RestResponse();
    System.runAs(user) {
      IncomingDoors.byWeb(
        capability,
        IncomingGroup.Record.class,
        new Set<String>{ 'season', 'source_system' }
      );
    }
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    answer.put('status', RestContext.response.statusCode);
    Assert.isFalse(AgentRefusal.forAgent, 'set back after the web address');
    return answer;
  }

  /** One batch through the web address as that user, refused by Refusing; its answer. */
  private static Map<String, Object> refusedAs(User user) {
    Map<String, Object> answer = throughWeb(user, new Refusing(), 1);
    Assert.areEqual(400, answer.get('status'), String.valueOf(answer));
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

  private class UnexpectedException extends Exception {
  }

  /** A capability that fails in a way Shoresh didn't expect. */
  private class Unexpected implements IncomingBatch.Capability {
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
      throw new UnexpectedException('not one of Shoresh\'s own');
    }
  }

  /**
   * Divisions: the first count records each save rows (one unless said) with a name too long for
   * Salesforce, so the save refuses each; the last is Seniors.
   */
  private class TooLong implements IncomingBatch.Capability {
    private Integer count;
    private Integer rows = 1;
    TooLong(Integer count) {
      this.count = count;
    }
    TooLong(Integer count, Integer rows) {
      this.count = count;
      this.rows = rows;
    }
    public String permissionSet() {
      return 'Send_Divisions';
    }
    public String permissionLabel() {
      return 'Send divisions';
    }
    public String what() {
      return 'Divisions';
    }
    public String seasonOf(Object record) {
      return ((IncomingGroup.Record) record).season;
    }
    public String systemOf(Object record) {
      return ((IncomingGroup.Record) record).source_system;
    }
    public void plan(IncomingBatch batch, List<Object> records) {
      Id main = [
        SELECT Id
        FROM Program__c
        WHERE Season__c = :batch.season.Id
        WITH USER_MODE
        LIMIT 1
      ]
      .Id;
      for (Integer i = 0; i < count; i++) {
        for (Integer r = 0; r < rows; r++) {
          batch.save(
            i,
            new Division__c(Program__c = main, Name = 'x'.repeat(81)),
            'Added.'
          );
        }
      }
      batch.save(
        count,
        new Division__c(Program__c = main, Name = 'Seniors'),
        'Added.'
      );
    }
  }

  // API-1.9: over a real web request, a problem Shoresh didn't expect still answers in Shoresh's
  // words ({"message": ...}), never the platform's error.
  @IsTest
  static void anUnexpectedProblemOverTheWebIsSaidPlainly() {
    IncomingTestData camp = new IncomingTestData();
    ScreenErrors.overWeb = true;
    Map<String, Object> answer = throughWeb(
      camp.sender('Send_Groups'),
      new Unexpected(),
      1
    );
    Assert.areEqual(500, answer.get('status'), String.valueOf(answer));
    Assert.areEqual(
      'Shoresh couldn\'t tell why. Try again.',
      ((String) answer.get('message'))
        .replaceAll(' For support: [A-Z0-9]{3}-[A-Z0-9]{3}\\.$', '')
    );
  }

  // API-2.5: over a real web request, a record Salesforce refuses is that record's problem
  // alone; the rest of the batch is saved.
  @IsTest
  static void aRefusedRecordOverTheWebLeavesTheRestSaved() {
    IncomingTestData camp = new IncomingTestData();
    ScreenErrors.overWeb = true;
    Map<String, Object> answer = throughWeb(
      camp.sender('Send_Divisions'),
      new TooLong(1),
      2
    );
    Assert.areEqual(200, answer.get('status'), String.valueOf(answer));
    Assert.areEqual(
      'problem: Not saved: "' +
        'x'.repeat(81) +
        '": Something typed is too long. Shorten it and save again.',
      IncomingTestData.said(answer, 1)
    );
    Assert.areEqual('saved: Added.', IncomingTestData.said(answer, 2));
    Assert.areEqual(
      1,
      [
        SELECT COUNT()
        FROM Division__c
        WHERE Name = 'Seniors'
        WITH SYSTEM_MODE
      ]
    );
  }

  private static Integer seniors() {
    return [
      SELECT COUNT()
      FROM Division__c
      WHERE Name = 'Seniors'
      WITH SYSTEM_MODE
    ];
  }

  // API-6.7: five refused records are each left out with why, and the rest is still saved.
  @IsTest
  static void fiveRefusedRecordsLeaveTheRestSaved() {
    IncomingTestData camp = new IncomingTestData();
    ScreenErrors.overWeb = true;
    Map<String, Object> answer = throughWeb(
      camp.sender('Send_Divisions'),
      new TooLong(5),
      6
    );
    Assert.areEqual(200, answer.get('status'), String.valueOf(answer));
    for (Integer row = 1; row <= 5; row++) {
      Assert.areEqual(TOO_LONG, IncomingTestData.said(answer, row));
    }
    Assert.areEqual('saved: Added.', IncomingTestData.said(answer, 6));
    Assert.areEqual(1, seniors());
  }

  // API-6.7: past five refused records nothing is saved, and each record still says why, through
  // the web address and the Flow action alike.
  @IsTest
  static void tooManyRefusedRecordsAreEachNamedAndNothingIsSaved() {
    IncomingTestData camp = new IncomingTestData();
    ScreenErrors.overWeb = true;
    User sender = camp.sender('Send_Divisions');
    Map<String, Object> answer = throughWeb(sender, new TooLong(6), 7);
    Assert.areEqual(200, answer.get('status'), String.valueOf(answer));
    String notSaved = 'problem: Not saved: 6 records in this batch were refused (each says why), so none of the batch was saved.';
    for (Integer row = 1; row <= 6; row++) {
      Assert.areEqual(TOO_LONG, IncomingTestData.said(answer, row));
    }
    Assert.areEqual(notSaved, IncomingTestData.said(answer, 7));
    Assert.areEqual(0, answer.get('saved'));
    Assert.areEqual(7, answer.get('problems'));

    List<Object> records = new List<Object>();
    for (Integer i = 0; i < 7; i++) {
      IncomingGroup.Record record = new IncomingGroup.Record();
      record.season = 'Summer 2026';
      record.source_system = IncomingTestData.SYSTEM_NAME;
      records.add(record);
    }
    List<IncomingResult> byFlow;
    System.runAs(sender) {
      byFlow = IncomingDoors.byFlow(new TooLong(6), records);
    }
    for (Integer row = 1; row <= 6; row++) {
      Assert.areEqual(TOO_LONG, IncomingTestData.said(byFlow, row));
    }
    Assert.areEqual(notSaved, IncomingTestData.said(byFlow, 7));
    Assert.areEqual(0, seniors());
    Assert.isTrue(camp.imports().isEmpty(), 'nothing recorded');
  }

  // API-6.7: a record whose rows are all refused (a camper's bunk in each week) counts once.
  @IsTest
  static void aRecordWithManyRefusedRowsIsOneRefusal() {
    IncomingTestData camp = new IncomingTestData();
    ScreenErrors.overWeb = true;
    Map<String, Object> answer = throughWeb(
      camp.sender('Send_Divisions'),
      new TooLong(1, 7),
      2
    );
    Assert.areEqual(TOO_LONG, IncomingTestData.said(answer, 1));
    Assert.areEqual('saved: Added.', IncomingTestData.said(answer, 2));
    Assert.areEqual(1, seniors());
  }
}
