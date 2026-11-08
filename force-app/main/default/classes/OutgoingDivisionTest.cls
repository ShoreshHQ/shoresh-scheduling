/**
 * What goes out names each group's division, so two groups of one name are told apart (API-6.6):
 * added after every field the group schedule had. Camp Willow's Summer 2026 (synthetic).
 */
@IsTest
private class OutgoingDivisionTest {
  // API-6.6: two groups called "Group A", one in Juniors and one in Seniors, go out told apart.
  @IsTest
  static void twoGroupsOfOneNameGoOutWithTheirDivisions() {
    IncomingTestData camp = new IncomingTestData();
    Division__c seniors = ShoreshTestData.division(
      camp.ids.get('Main'),
      'Seniors'
    );
    Group__c seniorA = ShoreshTestData.groupIn(seniors.Id, 'Group A');
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
      new List<Group__c>{
        new Group__c(Id = camp.ids.get('Group A'), Name = 'Group A'),
        seniorA
      },
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
    RestRequest request = new RestRequest();
    request.httpMethod = 'GET';
    request.params.put('season', 'Summer 2026');
    request.params.put('week', 'Week 1');
    request.params.put('format', 'csv');
    String file;
    System.runAs(camp.sender('Read_Group_Schedules')) {
      RestContext.request = request;
      RestContext.response = new RestResponse();
      OutgoingDoors.byWeb(new OutgoingGroupSchedule());
      file = RestContext.response.responseBody.toString();
    }
    String at =
      'Week 1,' +
      String.valueOf(day) +
      ',Group A,Period 1,09:00,09:45,';
    Assert.isTrue(
      file.startsWith(
        'week,date,group,time_block,start_time,end_time,activity,division\n'
      ),
      file
    );
    Assert.isTrue(file.contains(at + 'Swim,Juniors\n'), file);
    Assert.isTrue(file.contains(at + 'Flagpole,Seniors\n'), file);
  }
}
