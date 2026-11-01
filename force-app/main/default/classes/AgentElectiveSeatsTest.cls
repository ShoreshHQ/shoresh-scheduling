/**
 * Elective seats through an agent or the command line (docs/protocol/api.md API-1.66 to API-1.68):
 * the seats read as the Elective seats screen reads its run, with the run as read (seen); Assign
 * seats and a seat moved by hand saved through the screen's own saves, refused with nothing changed
 * when the seats changed since the agent read them. Synthetic camp: Week 1 of a season with
 * "Chugim" in Monday's Period 1 for Group A and Group B, Archery (2 seats) and Drama (no limit),
 * and a committed run with two campers, each choosing Drama first.
 */
@IsTest
private class AgentElectiveSeatsTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);
  private static Map<String, Id> ids;
  private static Id runId;
  private static List<Id> campers;

  private static void camp() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    ShoreshTestData.fullSeason(camp.Id);
    ids = ShoreshTestData.lastSeasonIds.clone();
    List<Activity__c> activities = new List<Activity__c>{
      ShoreshTestData.activity(ids.get('Season'), 'Archery', null),
      ShoreshTestData.activity(ids.get('Season'), 'Drama', null)
    };
    Database.insert(activities, AccessLevel.USER_MODE);
    ElectiveSet__c chugim = new ElectiveSet__c(
      Season__c = ids.get('Season'),
      Name = 'Chugim'
    );
    Database.insert(chugim, AccessLevel.USER_MODE);
    ids.put('Chugim', chugim.Id);
    List<Offering__c> offerings = new List<Offering__c>{
      new Offering__c(
        ElectiveSet__c = chugim.Id,
        Activity__c = activities[0].Id,
        Seats__c = 2
      ),
      new Offering__c(
        ElectiveSet__c = chugim.Id,
        Activity__c = activities[1].Id,
        NoSeatLimit__c = true
      )
    };
    Database.insert(offerings, AccessLevel.USER_MODE);
    ids.put('Archery', offerings[0].Id);
    ids.put('Drama', offerings[1].Id);
    ids.put('Drama activity', activities[1].Id);
    Schedule__c schedule = new Schedule__c(
      Program__c = ids.get('Main'),
      Week__c = ids.get('Week 1'),
      Name = 'Week 1',
      Status__c = 'Draft',
      Origin__c = 'Manual'
    );
    Database.insert(schedule, AccessLevel.USER_MODE);
    ScheduleGrid grid = new ScheduleGrid();
    grid.blocks.add(
      new ScheduleGrid.Block(ids.get('Period 1'), 'Period 1')
        .at('09:00', '09:45')
    );
    grid.groups.add(new ScheduleGrid.GroupRef(ids.get('Group A'), 'Group A'));
    grid.groups.add(new ScheduleGrid.GroupRef(ids.get('Group B'), 'Group B'));
    grid.items.add(new ScheduleGrid.Item('E', chugim.Id, 'Chugim'));
    grid.rows.add(new List<String>{ '1' });
    grid.rows.add(new List<String>{ '1' });
    ScheduleDaySaves.write(
      schedule.Id,
      new List<ScheduleDaySaves.DaySave>{
        new ScheduleDaySaves.DaySave(MONDAY, grid, null)
      }
    );
    List<Camper__c> made = new List<Camper__c>{
      new Camper__c(
        Season__c = ids.get('Season'),
        Name = 'Synthetic Camper 1',
        CamperNumber__c = 'SYN-0001'
      ),
      new Camper__c(
        Season__c = ids.get('Season'),
        Name = 'Synthetic Camper 2',
        CamperNumber__c = 'SYN-0002'
      )
    };
    Database.insert(made, AccessLevel.USER_MODE);
    ElectiveRun__c run = new ElectiveRun__c(
      Season__c = ids.get('Season'),
      Name = 'Chugim · Week 1',
      ElectiveSet__c = chugim.Id,
      Week__c = ids.get('Week 1'),
      Schedule__c = schedule.Id,
      Status__c = 'Committed',
      Revision__c = 1
    );
    Database.insert(run, AccessLevel.USER_MODE);
    runId = run.Id;
    campers = new List<Id>{ made[0].Id, made[1].Id };
    List<Preference__c> prefs = new List<Preference__c>();
    for (Integer i = 0; i < made.size(); i++) {
      prefs.add(
        new Preference__c(
          ElectiveRun__c = runId,
          Camper__c = made[i].Id,
          Group__c = i == 0 ? ids.get('Group A') : ids.get('Group B'),
          Choices__c = '[{"n":"Drama","a":"' +
            ids.get('Drama activity') +
            '","r":1,"k":"ranked"}]'
        )
      );
    }
    Database.insert(prefs, AccessLevel.USER_MODE);
  }

  private static Map<String, Object> asked(Map<String, Object> more) {
    Map<String, Object> body = new Map<String, Object>{
      'season' => [
        SELECT Name
        FROM Season__c
        WHERE Id = :ids.get('Season')
        WITH SYSTEM_MODE
      ]
      .Name,
      'week' => 'Week 1',
      'elective_set' => 'Chugim'
    };
    body.putAll(more);
    return body;
  }

  /** One request; answers [status, the answer read]. */
  private static List<Object> send(
    String address,
    String method,
    Map<String, Object> body
  ) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = method;
    if (method == 'GET') {
      for (String key : body.keySet()) {
        RestContext.request.addParameter(key, String.valueOf(body.get(key)));
      }
    } else {
      RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    }
    RestContext.response = new RestResponse();
    if (address == 'elective_seats_now') {
      AgentElectiveSeatsNow.get();
    } else if (address == 'assign_elective_seats' && method == 'GET') {
      AgentAssignElectiveSeats.get();
    } else if (address == 'assign_elective_seats') {
      AgentAssignElectiveSeats.post();
    } else {
      AgentMoveElectiveSeat.post();
    }
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.containsKey('message') ? answer.get('message') : answer
    };
  }

  /** Both campers in Drama: what the screen's engine gives for these choices. */
  private static List<Object> everyoneInDrama() {
    List<Object> seats = new List<Object>();
    for (Id camperId : campers) {
      seats.add(
        new Map<String, Object>{
          'camperId' => camperId,
          'day' => String.valueOf(MONDAY),
          'blockId' => ids.get('Period 1'),
          'offeringId' => ids.get('Drama')
        }
      );
    }
    return seats;
  }

  private static Decimal revision() {
    return ElectiveSeatsController.openRun(runId).revision;
  }

  private static List<Assignment__c> seats() {
    return [
      SELECT Camper__c, Offering__c, Locked__c, ByHand__c
      FROM Assignment__c
      WHERE ElectiveRun__c = :runId
      WITH SYSTEM_MODE
      ORDER BY Camper__r.Name
    ];
  }

  // API-1.66
  @IsTest
  static void theSeatsReadAreTheScreensRunWithItsSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp();
      Test.startTest();
      List<Object> read = send(
        'elective_seats_now',
        'GET',
        asked(new Map<String, Object>())
      );
      List<Object> noSet = send(
        'elective_seats_now',
        'GET',
        asked(new Map<String, Object>{ 'elective_set' => 'Nope' })
      );
      Test.stopTest();
      String said = (String) read[1];
      Assert.areEqual(200, read[0], said);
      Assert.isTrue(said.contains('seen: ' + revision()), said);
      Assert.isTrue(said.contains('Monday, Period 1'), said);
      Assert.isTrue(said.contains('Archery, Drama'), said);
      Assert.isTrue(
        said.contains('Synthetic Camper 1 #SYN-0001, Group A: no seats'),
        said
      );
      Assert.areEqual(400, noSet[0], String.valueOf(noSet[1]));
    }
  }

  // API-1.67
  @IsTest
  static void assignIsTheScreensAssignWithTheSeatsSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp();
      Decimal seen = revision();
      Test.startTest();
      List<Object> read = send(
        'assign_elective_seats',
        'GET',
        asked(new Map<String, Object>())
      );
      List<Object> stale = send(
        'assign_elective_seats',
        'POST',
        asked(
          new Map<String, Object>{
            'seen' => String.valueOf(seen - 1),
            'seats' => everyoneInDrama()
          }
        )
      );
      Integer afterStale = seats().size();
      List<Object> noSeen = send(
        'assign_elective_seats',
        'POST',
        asked(new Map<String, Object>{ 'seats' => everyoneInDrama() })
      );
      List<Object> done = send(
        'assign_elective_seats',
        'POST',
        asked(
          new Map<String, Object>{
            'seen' => String.valueOf(seen),
            'seats' => everyoneInDrama()
          }
        )
      );
      Test.stopTest();
      Assert.areEqual(200, read[0]);
      Map<String, Object> inputs = (Map<String, Object>) read[1];
      Assert.isTrue(inputs.containsKey('view') && inputs.containsKey('labels'));
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(0, afterStale, 'nothing assigned when refused');
      Assert.areEqual(400, noSeen[0], String.valueOf(noSeen[1]));
      Assert.areEqual(200, done[0], String.valueOf(done[1]));
      List<Assignment__c> now = seats();
      Assert.areEqual(2, now.size());
      for (Assignment__c seat : now) {
        Assert.areEqual(ids.get('Drama'), seat.Offering__c);
      }
      Assert.isTrue(revision() > seen, 'the run moved on');
    }
  }

  // API-1.68
  @IsTest
  static void aMoveIsTheScreensMoveLockedWithTheSeatsSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp();
      ElectiveSeatSaves.AssignRequest request = new ElectiveSeatSaves.AssignRequest();
      request.runId = runId;
      request.revision = revision();
      request.seats = (List<ElectiveSeatSaves.SeatIn>) JSON.deserialize(
        JSON.serialize(everyoneInDrama()),
        List<ElectiveSeatSaves.SeatIn>.class
      );
      ElectiveSeatsController.assignSeats(JSON.serialize(request));
      Decimal seen = revision();
      Map<String, Object> move = new Map<String, Object>{
        'camper' => 'synthetic camper 1',
        'day' => 'Monday',
        'time' => 'Period 1',
        'elective' => 'Archery'
      };
      Test.startTest();
      Map<String, Object> stale = move.clone();
      stale.put('seen', String.valueOf(seen - 1));
      List<Object> refused = send('move_elective_seat', 'POST', asked(stale));
      Map<String, Object> unknown = move.clone();
      unknown.put('camper', 'Nobody');
      unknown.put('seen', String.valueOf(seen));
      List<Object> nobody = send('move_elective_seat', 'POST', asked(unknown));
      Map<String, Object> byNumber = move.clone();
      byNumber.put('camper', '#SYN-0001');
      byNumber.put('seen', String.valueOf(seen));
      List<Object> done = send('move_elective_seat', 'POST', asked(byNumber));
      Test.stopTest();
      Assert.areEqual(409, refused[0], String.valueOf(refused[1]));
      Assert.areEqual(400, nobody[0], String.valueOf(nobody[1]));
      Assert.areEqual(200, done[0], String.valueOf(done[1]));
      Assert.areEqual('Moved Synthetic Camper 1 to Archery, locked.', done[1]);
      Assignment__c first = seats()[0];
      Assert.areEqual(ids.get('Archery'), first.Offering__c);
      Assert.isTrue(first.Locked__c && first.ByHand__c, 'by hand, locked');
      Assert.areEqual(ids.get('Drama'), seats()[1].Offering__c);
    }
  }
}
