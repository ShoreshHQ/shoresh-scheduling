/**
 * Synthetic elective seats for the agent's electives tests (AgentElectiveSeatsTest,
 * AgentElectivesRestTest): Week 1 of a season with "Chugim" in Monday's Period 1 for Group A and
 * Group B, Archery (2 seats) and Drama (no limit), and a committed run with two campers, each
 * choosing Drama first; and one request to a door, as an AI's would arrive.
 */
@IsTest
public class AgentElectivesTestData {
  private static final Map<String, AgentWeeks.Action> POSTS = new Map<String, AgentWeeks.Action>{
    'assign_elective_seats' => new AgentAssignElectiveSeats(),
    'move_elective_seat' => new AgentMoveElectiveSeat(),
    'lock_elective_seat' => new AgentLockElectiveSeat(),
    'start_new_elective_version' => new AgentStartNewElectiveVersion(),
    'clear_electives' => new AgentClearElectives()
  };

  public static final Date MONDAY = Date.newInstance(2026, 6, 29);
  public static Map<String, Id> ids;
  public static Id runId;
  public static List<Id> campers;

  public static void camp() {
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

  public static Map<String, Object> asked(Map<String, Object> more) {
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

  private static void get(String address) {
    if (address == 'elective_seats_now') {
      AgentElectiveSeatsNow.get();
    } else if (address == 'assign_elective_seats') {
      AgentAssignElectiveSeats.get();
    } else {
      AgentElectivesToClear.get();
    }
  }

  /** One request; answers [status, the answer read]. */
  public static List<Object> send(
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
    if (method == 'GET') {
      get(address);
    } else {
      AgentWeeks.answer(POSTS.get(address));
    }
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message') ?? answer
    };
  }

  /** Both campers in Drama: what the screen's engine gives for these choices. */
  public static List<Object> everyoneInDrama() {
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

  public static Decimal revision() {
    return ElectiveSeatsController.openRun(runId).revision;
  }

  public static List<Assignment__c> seats() {
    return [
      SELECT Camper__c, Offering__c, Locked__c, ByHand__c
      FROM Assignment__c
      WHERE ElectiveRun__c = :runId
      WITH SYSTEM_MODE
      ORDER BY Camper__r.Name
    ];
  }

  /** Seats assigned (both campers in Drama), as the screen's Assign seats saves them. */
  public static void assigned() {
    ElectiveSeatSaves.AssignRequest request = new ElectiveSeatSaves.AssignRequest();
    request.runId = runId;
    request.revision = revision();
    request.seats = (List<ElectiveSeatSaves.SeatIn>) JSON.deserialize(
      JSON.serialize(everyoneInDrama()),
      List<ElectiveSeatSaves.SeatIn>.class
    );
    ElectiveSeatsController.assignSeats(JSON.serialize(request));
  }

  /** Seats assigned and finalized, as the screen's Finalize does. */
  public static void finalized() {
    assigned();
    ElectiveSeatsController.finalizeRun(runId, revision());
  }
}
