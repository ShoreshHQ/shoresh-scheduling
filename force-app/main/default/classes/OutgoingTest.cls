/**
 * What goes out (docs/protocol/api.md; repo ADR 0024 choices 2 and 3): the group schedule, the
 * activity schedule, elective offerings and elective seats, each by a web address with a key, a
 * Flow action that sends to a saved destination, and CSV. Camp Willow's Summer 2026 (synthetic).
 */
@IsTest
private class OutgoingTest {
  /** A destination that answers with this status (then OK), keeping what it was sent. */
  private class Destination implements HttpCalloutMock {
    private Integer status;
    private String statusText;
    public List<HttpRequest> received = new List<HttpRequest>();

    Destination(Integer status, String statusText) {
      this.status = status;
      this.statusText = statusText;
    }

    public HttpResponse respond(HttpRequest request) {
      HttpResponse response = new HttpResponse();
      Boolean first = received.isEmpty();
      response.setStatusCode(first ? status : 200);
      response.setStatus(first ? statusText : 'OK');
      received.add(request);
      return response;
    }
  }

  /** A sending user holding these read permission sets, shown the season. */
  private static User reader(IncomingTestData camp, List<String> sets) {
    User user = camp.sender(sets[0]);
    System.runAs(new User(Id = UserInfo.getUserId())) {
      List<PermissionSetAssignment> more = new List<PermissionSetAssignment>();
      for (PermissionSet each : [
        SELECT Id
        FROM PermissionSet
        WHERE Name IN :sets AND Name != :sets[0]
      ]) {
        more.add(
          new PermissionSetAssignment(
            AssigneeId = user.Id,
            PermissionSetId = each.Id
          )
        );
      }
      Database.insert(more, AccessLevel.SYSTEM_MODE);
    }
    return user;
  }

  /** Week 1's first day, with Group A at Swim (two blocks) and Group B at Flagpole then Chugim. */
  private static Date firstDay(IncomingTestData camp) {
    Week__c week = [
      SELECT StartDate__c
      FROM Week__c
      WHERE Id = :camp.ids.get('Week 1')
      WITH SYSTEM_MODE
    ];
    return week.StartDate__c;
  }

  private static ScheduleGrid grid(IncomingTestData camp) {
    return ShoreshTestData.grid(
      [
        SELECT Id, Name
        FROM TimeBlock__c
        WHERE Program__c = :camp.ids.get('Main')
        WITH SYSTEM_MODE
        ORDER BY SortOrder__c
      ],
      [
        SELECT Id, Name
        FROM Group__c
        WHERE Division__c = :camp.ids.get('Juniors')
        WITH SYSTEM_MODE
        ORDER BY Name
      ],
      // Made-up records for the items: what goes out is the names Publish kept.
      new Map<String, Id>{
        'Swim' => camp.ids.get('Main'),
        'Flagpole' => camp.ids.get('Juniors')
      }
    );
  }

  /** A schedule of Week 1 with this one day, Published or a draft, written as Publish would. */
  private static Schedule__c schedule(
    IncomingTestData camp,
    String status,
    ScheduleGrid day
  ) {
    Schedule__c schedule = new Schedule__c(
      Program__c = camp.ids.get('Main'),
      Week__c = camp.ids.get('Week 1'),
      Name = status,
      Status__c = status,
      Origin__c = 'Manual'
    );
    PublishedGuard.allow();
    Database.insert(schedule, AccessLevel.SYSTEM_MODE);
    Database.insert(
      new ScheduleDay__c(
        Schedule__c = schedule.Id,
        Date__c = firstDay(camp),
        Part__c = 1,
        Revision__c = 1,
        GridFormatVersion__c = ScheduleGrid.FORMAT_VERSION,
        Grid__c = day.toText()
      ),
      AccessLevel.SYSTEM_MODE
    );
    PublishedGuard.done();
    return schedule;
  }

  /** The web address's answer: status, then the body (JSON parsed, CSV as text). */
  private static Map<String, Object> get(
    OutgoingDoors.Capability capability,
    Map<String, String> params
  ) {
    RestRequest request = new RestRequest();
    request.requestURI = '/services/apexrest/v1/' + capability.name();
    request.httpMethod = 'GET';
    request.params.putAll(params);
    RestContext.request = request;
    RestContext.response = new RestResponse();
    OutgoingDoors.byWeb(capability);
    String body = RestContext.response.responseBody.toString();
    Map<String, Object> answer = body.startsWith('{')
      ? (Map<String, Object>) JSON.deserializeUntyped(body)
      : new Map<String, Object>{ 'csv' => body };
    answer.put('status', RestContext.response.statusCode);
    return answer;
  }

  private static Map<String, String> week1() {
    return new Map<String, String>{
      'season' => 'Summer 2026',
      'week' => 'Week 1'
    };
  }

  private static OutgoingDoors.Send sendTo(String destination) {
    OutgoingDoors.Send send = new OutgoingDoors.Send();
    send.toSystem = destination;
    send.season = 'Summer 2026';
    send.week = 'Week 1';
    return send;
  }

  /** Each record as "field=value; ..." in the capability's field order, for comparing. */
  private static List<String> described(
    OutgoingDoors.Capability capability,
    List<Object> records
  ) {
    List<String> lines = new List<String>();
    for (Object each : records) {
      Map<String, Object> record = (Map<String, Object>) each;
      List<String> parts = new List<String>();
      for (String field : capability.fields()) {
        if (record.get(field) != null) {
          parts.add(field + '=' + record.get(field));
        }
      }
      lines.add(String.join(parts, '; '));
    }
    return lines;
  }

  // API-1.2, API-1.3, API-6.2: a published week's group schedule is the same by web address,
  // by a Flow action's send, and as a CSV file.
  @IsTest
  static void aPublishedWeekGoesOutTheSameByEveryDoor() {
    IncomingTestData camp = new IncomingTestData();
    schedule(camp, 'Published', grid(camp));
    Destination formstack = new Destination(200, 'OK');
    Test.setMock(HttpCalloutMock.class, formstack);
    OutgoingGroupSchedule capability = new OutgoingGroupSchedule();
    String day = String.valueOf(firstDay(camp));
    List<String> expected = new List<String>{
      'week=Week 1; date=' +
      day +
      '; group=Group A; time_block=Period 1; start_time=09:00; end_time=09:45; activity=Swim',
      'week=Week 1; date=' +
      day +
      '; group=Group B; time_block=Period 1; start_time=09:00; end_time=09:45; activity=Flagpole',
      'week=Week 1; date=' +
      day +
      '; group=Group B; time_block=Lunch; start_time=09:00; end_time=09:45; activity=Chugim'
    };
    User director = camp.sender('Read_Group_Schedules');
    Test.startTest();
    List<OutgoingResult> sent;
    System.runAs(director) {
      sent = OutgoingGroupSchedule.send(
        new List<OutgoingGroupSchedule.Request>{ request('formstack') }
      );
    }
    Test.stopTest();
    Map<String, Object> web;
    Map<String, String> asCsv = week1();
    asCsv.put('format', 'csv');
    Map<String, Object> file;
    System.runAs(camp.sender('Read_Group_Schedules')) {
      web = get(capability, week1());
      file = get(capability, asCsv);
    }
    Assert.areEqual(200, web.get('status'), String.valueOf(web));
    Assert.areEqual(
      expected,
      described(capability, (List<Object>) web.get('records'))
    );
    Assert.isTrue(sent[0].sent, sent[0].message);
    Assert.areEqual(
      'Sending the group schedule for Week 1 to formstack (3 records). If it doesn\'t go through, Settings shows why.',
      sent[0].message
    );
    Assert.areEqual('callout:formstack', formstack.received[0].getEndpoint());
    Map<String, Object> posted = (Map<String, Object>) JSON.deserializeUntyped(
      formstack.received[0].getBody()
    );
    Assert.areEqual('group_schedule', posted.get('what'));
    Assert.areEqual(
      expected,
      described(capability, (List<Object>) posted.get('records'))
    );
    Assert.areEqual(
      'week,date,group,time_block,start_time,end_time,activity\n' +
        'Week 1,' +
        day +
        ',Group A,Period 1,09:00,09:45,Swim\n' +
        'Week 1,' +
        day +
        ',Group B,Period 1,09:00,09:45,Flagpole\n' +
        'Week 1,' +
        day +
        ',Group B,Lunch,09:00,09:45,Chugim\n',
      file.get('csv')
    );
  }

  private static OutgoingGroupSchedule.Request request(String destination) {
    OutgoingGroupSchedule.Request request = new OutgoingGroupSchedule.Request();
    request.to_system = destination;
    request.season = 'Summer 2026';
    request.week = 'Week 1';
    return request;
  }

  // API-1.2: the activity schedule has each activity once per time it runs, with its groups.
  @IsTest
  static void theActivityScheduleListsEachActivityWithItsGroups() {
    IncomingTestData camp = new IncomingTestData();
    ScheduleGrid day = grid(camp);
    // Both groups at Flagpole first thing.
    day.rows[0][0] = '2';
    day.rows[0][1] = '';
    schedule(camp, 'Published', day);
    OutgoingActivitySchedule capability = new OutgoingActivitySchedule();
    Map<String, Object> web;
    System.runAs(camp.sender('Read_Activity_Schedules')) {
      web = get(capability, week1());
    }
    String date1 = String.valueOf(firstDay(camp));
    Assert.areEqual(
      new List<String>{
        'week=Week 1; date=' +
        date1 +
        '; activity=Chugim; time_block=Lunch; start_time=09:00; end_time=09:45; groups=Group B',
        'week=Week 1; date=' +
        date1 +
        '; activity=Flagpole; time_block=Period 1; start_time=09:00; end_time=09:45; groups=Group A, Group B'
      },
      described(capability, (List<Object>) web.get('records')),
      String.valueOf(web)
    );
  }

  // API-6.2, API-4.5: a week only drafted goes out nowhere, and once published, what goes out is
  // the published schedule, never the draft beside it.
  @IsTest
  static void aDraftNeverGoesOut() {
    IncomingTestData camp = new IncomingTestData();
    ScheduleGrid draft = grid(camp);
    draft.items[0].name = 'Draft swim';
    schedule(camp, 'Draft', draft);
    OutgoingGroupSchedule capability = new OutgoingGroupSchedule();
    Map<String, Object> before;
    System.runAs(camp.sender('Read_Group_Schedules')) {
      before = get(capability, week1());
    }
    Assert.areEqual(400, before.get('status'));
    Assert.areEqual(
      'Nothing in Week 1 of Summer 2026 is published yet. Schedules go out once a week is published.',
      before.get('message')
    );
    schedule(camp, 'Published', grid(camp));
    Map<String, Object> after;
    System.runAs(camp.sender('Read_Group_Schedules')) {
      after = get(capability, week1());
    }
    String said = JSON.serialize(after.get('records'));
    Assert.isTrue(said.contains('"Swim"'), said);
    Assert.isFalse(said.contains('Draft swim'), said);
  }

  // API-4.4: a key reaches only what its permission sets allow, and is told which set it needs.
  @IsTest
  static void aKeyWithoutTheReadPermissionSetIsRefused() {
    IncomingTestData camp = new IncomingTestData();
    schedule(camp, 'Published', grid(camp));
    Map<String, Object> answer;
    System.runAs(camp.sender('Read_Activity_Schedules')) {
      answer = get(new OutgoingGroupSchedule(), week1());
    }
    Assert.areEqual(403, answer.get('status'));
    Assert.areEqual(
      'This user can\'t read the group schedule. A Salesforce admin can give it the "Read group schedules" permission set.',
      answer.get('message')
    );
  }

  // API-4.7: a person holding Shoresh Scheduler reads through their AI as on screen, with no
  // capability permission set.
  @IsTest
  static void aSchedulerReadsWithoutTheReadPermissionSet() {
    IncomingTestData camp = new IncomingTestData();
    schedule(camp, 'Published', grid(camp));
    Map<String, Object> answer;
    System.runAs(camp.sender('Shoresh_Scheduler')) {
      answer = get(new OutgoingGroupSchedule(), week1());
    }
    Assert.areEqual(200, answer.get('status'), String.valueOf(answer));
  }

  /** Chugim's run in Week 1, with Maya (from the sign-up form) and Eli (Shoresh's own) seated. */
  private static IncomingTestData seated() {
    IncomingTestData camp = new IncomingTestData().withElectives();
    Camper__c maya = camp.camper('Maya Kohen', 'SYN-1');
    Camper__c eli = camp.camper('Eli Stone', null);
    Database.update(
      new Camper__c(Id = eli.Id, CamperNumber__c = '17'),
      AccessLevel.SYSTEM_MODE
    );
    Id archery = [
      SELECT Id
      FROM Offering__c
      WHERE Activity__c = :camp.ids.get('Archery')
      WITH SYSTEM_MODE
    ]
    .Id;
    List<Assignment__c> seats = new List<Assignment__c>();
    for (Camper__c camper : new List<Camper__c>{ maya, eli }) {
      seats.add(
        new Assignment__c(
          ElectiveRun__c = camp.run.Id,
          Offering__c = archery,
          Camper__c = camper.Id,
          TimeBlock__c = camp.ids.get('Lunch'),
          Date__c = firstDay(camp),
          ActivityName__c = 'Archery',
          LocationName__c = 'Field A',
          Group__c = camp.ids.get('Group A'),
          GroupName__c = 'Group A'
        )
      );
    }
    Database.insert(seats, AccessLevel.SYSTEM_MODE);
    return camp;
  }

  // API-6.2: elective seats go out only once they are finalized.
  @IsTest
  static void electiveSeatsGoOutOnlyOnFinalize() {
    IncomingTestData camp = seated();
    OutgoingElectiveSeats capability = new OutgoingElectiveSeats();
    Map<String, Object> before;
    System.runAs(camp.sender('Read_Elective_Seats')) {
      before = get(capability, week1());
    }
    Assert.areEqual(400, before.get('status'));
    Assert.areEqual(
      'No elective seats in "Week 1" are final yet. Seats go out once they are finalized.',
      before.get('message')
    );
    Database.update(
      new ElectiveRun__c(Id = camp.run.Id, Status__c = 'Final'),
      AccessLevel.SYSTEM_MODE
    );
    Map<String, Object> after;
    System.runAs(camp.sender('Read_Elective_Seats')) {
      after = get(capability, week1());
    }
    Assert.areEqual(
      2,
      ((List<Object>) after.get('records')).size(),
      String.valueOf(after)
    );
  }

  // API-4.6: a camper from an outside system goes out by that system and its ID only; their
  // name, number and bunk belong to that system and are not sent back. Shoresh's own camper goes
  // out by name.
  @IsTest
  static void anOutsideCamperGoesOutByTheirIdOnly() {
    IncomingTestData camp = seated();
    Database.update(
      new ElectiveRun__c(Id = camp.run.Id, Status__c = 'Final'),
      AccessLevel.SYSTEM_MODE
    );
    OutgoingElectiveSeats capability = new OutgoingElectiveSeats();
    Map<String, Object> answer;
    System.runAs(camp.sender('Read_Elective_Seats')) {
      answer = get(capability, week1());
    }
    String date1 = String.valueOf(firstDay(camp));
    Assert.areEqual(
      new List<String>{
        'week=Week 1; elective_set=Chugim; date=' +
        date1 +
        '; time_block=Lunch; activity=Archery; location=Field A; camper_name=Eli Stone; camper_number=17; bunk=Group A',
        'week=Week 1; elective_set=Chugim; date=' +
        date1 +
        '; time_block=Lunch; activity=Archery; location=Field A; source_system=Sign-up Form; camper_id=SYN-1'
      },
      described(capability, (List<Object>) answer.get('records')),
      String.valueOf(answer)
    );
  }

  // API-1.2: elective offerings go out with their seats, so a form can collect choices; one only
  // proposed is not offered yet.
  @IsTest
  static void electiveOfferingsGoOutWithTheirSeats() {
    IncomingTestData camp = new IncomingTestData().withElectives();
    Database.update(
      new Offering__c(
        Id = [
          SELECT Id
          FROM Offering__c
          WHERE Activity__c = :camp.ids.get('Swim')
          WITH SYSTEM_MODE
        ]
        .Id,
        Proposed__c = true
      ),
      AccessLevel.SYSTEM_MODE
    );
    OutgoingElectiveOfferings capability = new OutgoingElectiveOfferings();
    Map<String, Object> answer;
    System.runAs(camp.sender('Read_Elective_Offerings')) {
      answer = get(
        capability,
        new Map<String, String>{ 'season' => 'Summer 2026' }
      );
    }
    Assert.areEqual(
      new List<String>{ 'elective_set=Chugim; activity=Archery; seats=10' },
      described(capability, (List<Object>) answer.get('records')),
      String.valueOf(answer)
    );
  }

  // API-6.3: a send that fails is answered in one sentence and shown on Settings until a later
  // send of the same thing to the same destination goes through.
  @IsTest
  static void aFailedSendShowsOnSettingsUntilOneGoesThrough() {
    IncomingTestData camp = new IncomingTestData();
    schedule(camp, 'Published', grid(camp));
    Test.setMock(
      HttpCalloutMock.class,
      new Destination(503, 'Service Unavailable')
    );
    User director = camp.sender('Read_Group_Schedules');
    String said = 'Couldn\'t send the group schedule for Week 1 to formstack: formstack answered 503 Service Unavailable.';
    Test.startTest();
    List<OutgoingResult> failed;
    System.runAs(director) {
      failed = OutgoingDoors.bySend(
        new OutgoingGroupSchedule(),
        new List<OutgoingDoors.Send>{ sendTo('formstack') }
      );
    }
    Test.stopTest();
    // On its way when the Flow asked; the destination's refusal shows on Settings.
    Assert.isTrue(failed[0].sent, failed[0].message);
    Assert.areEqual(
      new List<String>{ said },
      SendLog.failedLast(camp.season.Id)
    );
    Assert.areEqual(
      new List<String>{ said },
      SeasonSetupReader.read(camp.season.Id).failedSends
    );
  }

  // API-6.3: a later send of the same thing to the same destination that goes through is the
  // last one, so the failure no longer shows (both sends made by one Flow run, in turn).
  @IsTest
  static void aSendThatGoesThroughClearsTheFailure() {
    IncomingTestData camp = new IncomingTestData();
    schedule(camp, 'Published', grid(camp));
    Test.setMock(
      HttpCalloutMock.class,
      new Destination(503, 'Service Unavailable')
    );
    User director = camp.sender('Read_Group_Schedules');
    Test.startTest();
    List<OutgoingResult> results;
    System.runAs(director) {
      results = OutgoingDoors.bySend(
        new OutgoingGroupSchedule(),
        new List<OutgoingDoors.Send>{ sendTo('formstack'), sendTo('formstack') }
      );
    }
    Test.stopTest();
    Assert.areEqual(new List<String>(), SendLog.failedLast(camp.season.Id));
  }

  // API-4.4: sending is reading, so a Flow's send needs the capability's read permission set too.
  @IsTest
  static void aSendWithoutTheReadPermissionSetIsRefused() {
    IncomingTestData camp = new IncomingTestData();
    schedule(camp, 'Published', grid(camp));
    List<OutgoingResult> results;
    System.runAs(camp.sender('Read_Activity_Schedules')) {
      results = OutgoingDoors.bySend(
        new OutgoingGroupSchedule(),
        new List<OutgoingDoors.Send>{ sendTo('formstack') }
      );
    }
    Assert.areEqual(
      'Couldn\'t send the group schedule for Week 1 to formstack: This user can\'t send the group schedule. A Salesforce admin can give it the "Read group schedules" permission set.',
      results[0].message
    );
  }

  // API-6.3: a published day that can't be read is said, never left out of what goes out.
  @IsTest
  static void anUnreadablePublishedDayIsSaidNotHidden() {
    IncomingTestData camp = new IncomingTestData();
    Schedule__c published = schedule(camp, 'Published', grid(camp));
    PublishedGuard.allow();
    Database.update(
      new ScheduleDay__c(
        Id = [
          SELECT Id
          FROM ScheduleDay__c
          WHERE Schedule__c = :published.Id
          WITH SYSTEM_MODE
        ]
        .Id,
        Grid__c = 'not a grid'
      ),
      AccessLevel.SYSTEM_MODE
    );
    PublishedGuard.done();
    Map<String, Object> answer;
    System.runAs(camp.sender('Read_Group_Schedules')) {
      answer = get(new OutgoingGroupSchedule(), week1());
    }
    Assert.areEqual(400, answer.get('status'), String.valueOf(answer));
    Assert.areEqual(
      'The published schedule for ' +
        firstDay(camp).format() +
        ' can\'t be read, so this week can\'t go out. Publish the week again.',
      answer.get('message')
    );
  }

  // API-6.3, API-1.5: a send to no saved destination, or of a week not published, fails in a
  // plain sentence, kept for Settings.
  @IsTest
  static void aSendThatCantBeMadeSaysWhy() {
    IncomingTestData camp = new IncomingTestData();
    User director = camp.sender('Read_Group_Schedules');
    Test.startTest();
    List<OutgoingResult> results;
    System.runAs(director) {
      results = OutgoingDoors.bySend(
        new OutgoingGroupSchedule(),
        new List<OutgoingDoors.Send>{ sendTo('formstack') }
      );
    }
    Assert.areEqual(
      'Couldn\'t send the group schedule for Week 1 to formstack: Nothing in Week 1 of Summer 2026 is published yet. Schedules go out once a week is published.',
      results[0].message
    );
    schedule(camp, 'Published', grid(camp));
    System.runAs(director) {
      results = OutgoingDoors.bySend(
        new OutgoingGroupSchedule(),
        new List<OutgoingDoors.Send>{ sendTo('https://example.com/x') }
      );
    }
    Assert.areEqual(
      'Couldn\'t send the group schedule for Week 1 to https://example.com/x: Say which saved destination to send to (to_system): the name of a Named Credential, letters, numbers and single underscores.',
      results[0].message
    );
    // The sends are kept just after (SendLog).
    Test.stopTest();
    Assert.areEqual(2, SendLog.failedLast(camp.season.Id).size());
  }

  // API-1.3: every capability's own web address and Flow action reach its one piece of logic:
  // each Flow action posts the records its web address answers.
  @IsTest
  static void everyCapabilitysDoorsGiveTheSameRecords() {
    IncomingTestData camp = seated();
    Database.update(
      new ElectiveRun__c(Id = camp.run.Id, Status__c = 'Final'),
      AccessLevel.SYSTEM_MODE
    );
    schedule(camp, 'Published', grid(camp));
    Destination formstack = new Destination(200, 'OK');
    Test.setMock(HttpCalloutMock.class, formstack);
    User director = reader(
      camp,
      new List<String>{
        'Read_Activity_Schedules',
        'Read_Elective_Offerings',
        'Read_Elective_Seats'
      }
    );
    Test.startTest();
    System.runAs(director) {
      sendAll();
    }
    Test.stopTest();
    Assert.areEqual(3, formstack.received.size());
    System.runAs(director) {
      Assert.areEqual(
        records(webAnswer(new OutgoingActivitySchedule(), false)),
        records(formstack.received[0].getBody())
      );
      String file = webAnswer(new OutgoingElectiveOfferings(), true);
      Assert.areEqual(file, formstack.received[1].getBody());
      Assert.isTrue(file.startsWith('elective_set,activity,seats'), file);
      Assert.areEqual(
        records(webAnswer(new OutgoingElectiveSeats(), false)),
        records(formstack.received[2].getBody())
      );
    }
  }

  /** The activity schedule, offerings (as CSV) and seats, each sent by its own Flow action. */
  private static void sendAll() {
    OutgoingActivitySchedule.Request activity = new OutgoingActivitySchedule.Request();
    activity.to_system = 'formstack';
    activity.season = 'Summer 2026';
    activity.week = 'Week 1';
    OutgoingActivitySchedule.send(
      new List<OutgoingActivitySchedule.Request>{ activity }
    );
    OutgoingElectiveOfferings.Request offerings = new OutgoingElectiveOfferings.Request();
    offerings.to_system = 'formstack';
    offerings.season = 'Summer 2026';
    offerings.as_csv = true;
    OutgoingElectiveOfferings.send(
      new List<OutgoingElectiveOfferings.Request>{ offerings }
    );
    OutgoingElectiveSeats.Request seats = new OutgoingElectiveSeats.Request();
    seats.to_system = 'formstack';
    seats.season = 'Summer 2026';
    seats.week = 'Week 1';
    OutgoingElectiveSeats.send(
      new List<OutgoingElectiveSeats.Request>{ seats }
    );
  }

  /** The capability's own web address's answer for Week 1, as text. */
  private static String webAnswer(
    OutgoingDoors.Capability capability,
    Boolean asCsv
  ) {
    RestRequest request = new RestRequest();
    request.httpMethod = 'GET';
    request.params.putAll(week1());
    if (asCsv) {
      request.params.put('format', 'csv');
    }
    RestContext.request = request;
    RestContext.response = new RestResponse();
    if (capability instanceof OutgoingActivitySchedule) {
      OutgoingActivitySchedule.get();
    } else if (capability instanceof OutgoingElectiveOfferings) {
      OutgoingElectiveOfferings.get();
    } else {
      OutgoingElectiveSeats.get();
    }
    Assert.areEqual(200, RestContext.response.statusCode);
    return RestContext.response.responseBody.toString();
  }

  private static String records(String body) {
    return JSON.serialize(
      ((Map<String, Object>) JSON.deserializeUntyped(body)).get('records')
    );
  }

  // API-4.5: nothing kept inside (parent comments, drafts, conflicts) is a field of anything going out.
  @IsTest
  static void nothingKeptInsideIsAFieldGoingOut() {
    List<OutgoingDoors.Capability> all = new List<OutgoingDoors.Capability>{
      new OutgoingGroupSchedule(),
      new OutgoingActivitySchedule(),
      new OutgoingElectiveOfferings(),
      new OutgoingElectiveSeats()
    };
    for (OutgoingDoors.Capability capability : all) {
      String fields = String.join(capability.fields(), ',');
      Assert.isFalse(
        Pattern.compile('comment|draft|version|conflict|medical|family|parent')
          .matcher(fields)
          .find(),
        capability.name() + ': ' + fields
      );
    }
  }
}
