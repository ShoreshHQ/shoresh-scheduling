/**
 * What goes out says a numbered-days season's day as "Day 3" (WEEK-1.7): each record with a date
 * also has day (a CSV file's last column), so what already reads a feed reads the same; a named
 * season's feeds are exactly as before. Camp Willow's Summer 2026 (synthetic).
 */
@IsTest
private class OutgoingDayNumberTest {
  /** A destination that takes everything, keeping what it was sent. */
  private class Destination implements HttpCalloutMock {
    public List<HttpRequest> received = new List<HttpRequest>();

    public HttpResponse respond(HttpRequest request) {
      received.add(request);
      HttpResponse response = new HttpResponse();
      response.setStatusCode(200);
      return response;
    }
  }

  /** Week 1's first day published, with Group A at Swim and Group B at Flagpole then Chugim. */
  private static String published(IncomingTestData camp) {
    Date day = [
      SELECT StartDate__c
      FROM Week__c
      WHERE Id = :camp.ids.get('Week 1')
      WITH SYSTEM_MODE
    ]
    .StartDate__c;
    ScheduleGrid grid = ShoreshTestData.grid(
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
      new Map<String, Id>{
        'Swim' => camp.ids.get('Main'),
        'Flagpole' => camp.ids.get('Juniors')
      }
    );
    Schedule__c schedule = new Schedule__c(
      Program__c = camp.ids.get('Main'),
      Week__c = camp.ids.get('Week 1'),
      Name = 'Published',
      Status__c = 'Published',
      Origin__c = 'Manual'
    );
    PublishedGuard.allow();
    Database.insert(schedule, AccessLevel.SYSTEM_MODE);
    Database.insert(
      new ScheduleDay__c(
        Schedule__c = schedule.Id,
        Date__c = day,
        Part__c = 1,
        Revision__c = 1,
        GridFormatVersion__c = ScheduleGrid.FORMAT_VERSION,
        Grid__c = grid.toText()
      ),
      AccessLevel.SYSTEM_MODE
    );
    PublishedGuard.done();
    return String.valueOf(day);
  }

  /** The web address's answer for Week 1, as the text it sends. */
  private static String web(
    OutgoingDoors.Capability capability,
    Boolean asCsv
  ) {
    RestRequest request = new RestRequest();
    request.httpMethod = 'GET';
    request.params.put('season', 'Summer 2026');
    request.params.put('week', 'Week 1');
    if (asCsv) {
      request.params.put('format', 'csv');
    }
    RestContext.request = request;
    RestContext.response = new RestResponse();
    OutgoingDoors.byWeb(capability);
    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      RestContext.response.responseBody.toString()
    );
    return RestContext.response.responseBody.toString();
  }

  /** Every record has the capability's fields and day, "Day 1". */
  private static void sayDay1(
    OutgoingDoors.Capability capability,
    String body
  ) {
    Set<String> fields = new Set<String>(capability.fields());
    fields.add('day');
    List<Object> records = (List<Object>) ((Map<String, Object>) JSON.deserializeUntyped(
        body
      ))
      .get('records');
    Assert.isFalse(records.isEmpty(), body);
    for (Object each : records) {
      Map<String, Object> record = (Map<String, Object>) each;
      Assert.areEqual(fields, record.keySet(), body);
      Assert.areEqual('Day 1', record.get('day'), body);
    }
  }

  private static void numberDays(IncomingTestData camp) {
    Database.update(
      new Season__c(Id = camp.season.Id, NumberedDays__c = true),
      AccessLevel.SYSTEM_MODE
    );
  }

  /** Maya's final seat at Archery on Week 1's first day. */
  private static void seated(IncomingTestData camp, String day) {
    Database.insert(
      new Assignment__c(
        ElectiveRun__c = camp.run.Id,
        Offering__c = [
          SELECT Id
          FROM Offering__c
          WHERE Activity__c = :camp.ids.get('Archery')
          WITH SYSTEM_MODE
        ]
        .Id,
        Camper__c = camp.camper('Maya Kohen', null).Id,
        TimeBlock__c = camp.ids.get('Lunch'),
        Date__c = Date.valueOf(day),
        ActivityName__c = 'Archery',
        LocationName__c = 'Field A',
        Group__c = camp.ids.get('Group A'),
        GroupName__c = 'Group A'
      ),
      AccessLevel.SYSTEM_MODE
    );
    Database.update(
      new ElectiveRun__c(Id = camp.run.Id, Status__c = 'Final'),
      AccessLevel.SYSTEM_MODE
    );
  }

  // WEEK-1.7: a numbered-days season's group schedule says "Day 1" as well as every field it
  // had, by the web address, by a Flow action's send, and as CSV's last column.
  @IsTest
  static void aNumberedSeasonsGroupScheduleSaysTheDayLast() {
    IncomingTestData camp = new IncomingTestData();
    String day = published(camp);
    numberDays(camp);
    Destination formstack = new Destination();
    Test.setMock(HttpCalloutMock.class, formstack);
    OutgoingGroupSchedule.Request send = new OutgoingGroupSchedule.Request();
    send.to_system = 'formstack';
    send.season = 'Summer 2026';
    send.week = 'Week 1';
    User director = camp.sender('Read_Group_Schedules');
    String answer;
    String file;
    Test.startTest();
    System.runAs(director) {
      OutgoingGroupSchedule.send(
        new List<OutgoingGroupSchedule.Request>{ send }
      );
      answer = web(new OutgoingGroupSchedule(), false);
      file = web(new OutgoingGroupSchedule(), true);
    }
    Test.stopTest();
    sayDay1(new OutgoingGroupSchedule(), answer);
    sayDay1(new OutgoingGroupSchedule(), formstack.received[0].getBody());
    Assert.areEqual(
      'week,date,group,time_block,start_time,end_time,activity,division,day\n' +
        'Week 1,' +
        day +
        ',Group A,Period 1,09:00,09:45,Swim,Juniors,Day 1\n' +
        'Week 1,' +
        day +
        ',Group B,Period 1,09:00,09:45,Flagpole,Juniors,Day 1\n' +
        'Week 1,' +
        day +
        ',Group B,Lunch,09:00,09:45,Chugim,Juniors,Day 1\n',
      file
    );
  }

  // WEEK-1.7: the activity schedule and elective seats say it the same way; offerings have no
  // date, so no day.
  @IsTest
  static void aNumberedSeasonsOtherFeedsSayTheDayLast() {
    IncomingTestData camp = new IncomingTestData().withElectives();
    String day = published(camp);
    seated(camp, day);
    numberDays(camp);
    String activities;
    String activitiesFile;
    String seats;
    String offerings;
    System.runAs(camp.sender('Read_Activity_Schedules')) {
      activities = web(new OutgoingActivitySchedule(), false);
      activitiesFile = web(new OutgoingActivitySchedule(), true);
    }
    System.runAs(camp.sender('Read_Elective_Seats')) {
      seats = web(new OutgoingElectiveSeats(), true);
    }
    System.runAs(camp.sender('Read_Elective_Offerings')) {
      offerings = web(new OutgoingElectiveOfferings(), false);
    }
    sayDay1(new OutgoingActivitySchedule(), activities);
    Assert.isTrue(
      activitiesFile.startsWith(
        'week,date,activity,time_block,start_time,end_time,groups,day\n'
      ),
      activitiesFile
    );
    Assert.isTrue(activitiesFile.contains(',Group A,Day 1\n'), activitiesFile);
    Assert.isTrue(seats.split('\n')[0].endsWith(',bunk,day'), seats);
    Assert.isTrue(seats.split('\n')[1].endsWith(',Group A,Day 1'), seats);
    Assert.isFalse(offerings.contains('"day"'), offerings);
  }

  // WEEK-1.7: a named-days season's feeds are exactly what they always were, byte for byte.
  @IsTest
  static void aNamedSeasonsFeedsAreExactlyAsBefore() {
    IncomingTestData camp = new IncomingTestData();
    String day = published(camp);
    String answer;
    String file;
    System.runAs(camp.sender('Read_Group_Schedules')) {
      answer = web(new OutgoingGroupSchedule(), false);
      file = web(new OutgoingGroupSchedule(), true);
    }
    // The door adds nothing to the rows the capability gives.
    Assert.areEqual(
      JSON.serialize(
        new Map<String, Object>{
          'season' => 'Summer 2026',
          'week' => 'Week 1',
          'records' => new OutgoingGroupSchedule().rows(camp.season, 'Week 1')
        }
      ),
      answer
    );
    Assert.areEqual(
      'week,date,group,time_block,start_time,end_time,activity,division\n' +
        'Week 1,' +
        day +
        ',Group A,Period 1,09:00,09:45,Swim,Juniors\n' +
        'Week 1,' +
        day +
        ',Group B,Period 1,09:00,09:45,Flagpole,Juniors\n' +
        'Week 1,' +
        day +
        ',Group B,Lunch,09:00,09:45,Chugim,Juniors\n',
      file
    );
  }
}
