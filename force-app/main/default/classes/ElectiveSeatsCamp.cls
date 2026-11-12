/**
 * Week 1 of a season with "Chugim" in Period 1 on Monday and Tuesday for Group A and Group B
 * (one division, Juniors): Archery (2 seats), Drama (no limit), Pottery (10 seats, at least 3)
 * and Ceramics (proposed, not confirmed). A committed run with the campers asked for, each in
 * Group A or B, every one choosing Drama first.
 */
@IsTest
public class ElectiveSeatsCamp {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);
  private static final Date TUESDAY = MONDAY.addDays(1);

  public Id campId;
  public Map<String, Id> ids;
  public Id setId;
  public Id scheduleId;
  public Id runId;
  public List<Id> campers = new List<Id>();

  public ElectiveSeatsCamp(Integer camperCount) {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    campId = camp.Id;
    ShoreshTestData.fullSeason(camp.Id);
    ids = ShoreshTestData.lastSeasonIds.clone();
    makeMenu();
    makeSchedule();
    makeRun(camperCount);
  }

  private void makeMenu() {
    List<Activity__c> activities = new List<Activity__c>();
    for (
      String name : new List<String>{
        'Archery',
        'Drama',
        'Pottery',
        'Ceramics'
      }
    ) {
      activities.add(ShoreshTestData.activity(ids.get('Season'), name, null));
    }
    Database.insert(activities, AccessLevel.USER_MODE);
    for (Activity__c activity : activities) {
      ids.put(activity.Name, activity.Id);
    }
    ElectiveSet__c chugim = new ElectiveSet__c(
      Season__c = ids.get('Season'),
      Name = 'Chugim'
    );
    Database.insert(chugim, AccessLevel.USER_MODE);
    setId = chugim.Id;
    List<Offering__c> offerings = new List<Offering__c>{
      new Offering__c(
        ElectiveSet__c = setId,
        Activity__c = ids.get('Archery'),
        Seats__c = 2
      ),
      new Offering__c(
        ElectiveSet__c = setId,
        Activity__c = ids.get('Drama'),
        NoSeatLimit__c = true
      ),
      new Offering__c(
        ElectiveSet__c = setId,
        Activity__c = ids.get('Pottery'),
        Seats__c = 10,
        MinimumToRun__c = 3
      ),
      new Offering__c(
        ElectiveSet__c = setId,
        Activity__c = ids.get('Ceramics'),
        Seats__c = 5,
        Proposed__c = true
      )
    };
    Database.insert(offerings, AccessLevel.USER_MODE);
    for (Integer i = 0; i < offerings.size(); i++) {
      ids.put('o:' + activities[i].Name, offerings[i].Id);
    }
  }

  private void makeSchedule() {
    Schedule__c schedule = new Schedule__c(
      Program__c = ids.get('Main'),
      Week__c = ids.get('Week 1'),
      Name = 'Week 1',
      Status__c = 'Draft',
      Origin__c = 'Manual'
    );
    Database.insert(schedule, AccessLevel.USER_MODE);
    scheduleId = schedule.Id;
    ScheduleDaySaves.write(
      scheduleId,
      new List<ScheduleDaySaves.DaySave>{
        new ScheduleDaySaves.DaySave(
          MONDAY,
          grid(new List<String>{ '1,', '1,' }),
          null
        ),
        new ScheduleDaySaves.DaySave(
          TUESDAY,
          grid(new List<String>{ '1,', '1,' }),
          null
        )
      }
    );
  }

  /** A day with Chugim in Period 1 for each row given ('1,' holds it; ',' is open). */
  public ScheduleGrid grid(List<String> rows) {
    ScheduleGrid result = new ScheduleGrid();
    result.blocks.add(
      new ScheduleGrid.Block(ids.get('Period 1'), 'Period 1')
        .at('09:00', '09:45')
    );
    result.blocks.add(
      new ScheduleGrid.Block(ids.get('Lunch'), 'Lunch').at('12:00', '12:45')
    );
    result.groups.add(new ScheduleGrid.GroupRef(ids.get('Group A'), 'Group A'));
    result.groups.add(new ScheduleGrid.GroupRef(ids.get('Group B'), 'Group B'));
    result.items.add(new ScheduleGrid.Item('E', setId, 'Chugim'));
    for (String row : rows) {
      result.rows.add(row.split(',', -1));
    }
    return result;
  }

  private void makeRun(Integer camperCount) {
    List<Camper__c> made = new List<Camper__c>();
    for (Integer i = 1; i <= camperCount; i++) {
      made.add(
        new Camper__c(
          Season__c = ids.get('Season'),
          Name = 'Synthetic Camper ' + i,
          CamperNumber__c = 'SYN-' + String.valueOf(i).leftPad(4, '0')
        )
      );
    }
    Database.insert(made, AccessLevel.USER_MODE);
    ElectiveRun__c run = new ElectiveRun__c(
      Season__c = ids.get('Season'),
      Name = 'Chugim · Week 1',
      ElectiveSet__c = setId,
      Week__c = ids.get('Week 1'),
      Schedule__c = scheduleId,
      Status__c = 'Committed',
      Revision__c = 1
    );
    Database.insert(run, AccessLevel.USER_MODE);
    runId = run.Id;
    List<Preference__c> prefs = new List<Preference__c>();
    for (Integer i = 0; i < made.size(); i++) {
      campers.add(made[i].Id);
      prefs.add(
        new Preference__c(
          ElectiveRun__c = runId,
          Camper__c = made[i].Id,
          Group__c = Math.mod(i, 2) == 0
            ? ids.get('Group A')
            : ids.get('Group B'),
          Choices__c = '[{"n":"Drama","a":"' +
            ids.get('Drama') +
            '","r":1,"k":"ranked"}]'
        )
      );
    }
    Database.insert(prefs, AccessLevel.USER_MODE);
  }

  public ElectiveSeatSaves.SeatIn seat(
    Integer camper,
    Date day,
    String activity
  ) {
    ElectiveSeatSaves.SeatIn result = new ElectiveSeatSaves.SeatIn();
    result.camperId = campers[camper];
    result.day = day;
    result.blockId = ids.get('Period 1');
    result.offeringId = ids.get('o:' + activity);
    return result;
  }

  /** Every camper in Drama on both days: what the engine gives for these choices. */
  public ElectiveSeatSaves.AssignRequest everyoneInDrama(Decimal revision) {
    ElectiveSeatSaves.AssignRequest request = new ElectiveSeatSaves.AssignRequest();
    request.runId = runId;
    request.revision = revision;
    for (Integer i = 0; i < campers.size(); i++) {
      request.seats.add(seat(i, MONDAY, 'Drama'));
      request.seats.add(seat(i, TUESDAY, 'Drama'));
    }
    return request;
  }

  public ElectiveSeats.RunView assign(ElectiveSeatSaves.AssignRequest request) {
    return ElectiveSeatsController.assignSeats(JSON.serialize(request));
  }

  /** Moves a camper's Monday seat to another offering by hand. */
  public ElectiveSeats.RunView move(
    Decimal revision,
    Integer camper,
    String activity
  ) {
    ElectiveSeatChange.ChangeRequest request = mondayChange(revision, camper);
    request.offeringId = ids.get('o:' + activity);
    return ElectiveSeatsController.changeSeat(JSON.serialize(request));
  }

  /** Locks a camper's Monday seat. */
  public ElectiveSeats.RunView lockSeat(Decimal revision, Integer camper) {
    return setLock(revision, camper, true);
  }

  /** Unlocks a camper's Monday seat. */
  public ElectiveSeats.RunView unlockSeat(Decimal revision, Integer camper) {
    return setLock(revision, camper, false);
  }

  private ElectiveSeats.RunView setLock(
    Decimal revision,
    Integer camper,
    Boolean locked
  ) {
    ElectiveSeatChange.ChangeRequest request = mondayChange(revision, camper);
    request.locked = locked;
    return ElectiveSeatsController.changeSeat(JSON.serialize(request));
  }

  private ElectiveSeatChange.ChangeRequest mondayChange(
    Decimal revision,
    Integer camper
  ) {
    ElectiveSeatChange.ChangeRequest request = new ElectiveSeatChange.ChangeRequest();
    request.runId = runId;
    request.revision = revision;
    request.camperId = campers[camper];
    request.day = MONDAY;
    request.blockId = ids.get('Period 1');
    return request;
  }

  /** "Drama both days": Drama on Monday and Tuesday's Period 1, as a set (slice E8). */
  public LinkedChoice__c dramaBothDays(String appliesTo, Id divisionId) {
    LinkedChoice__c choice = new LinkedChoice__c(
      ElectiveSet__c = setId,
      Name = 'Drama both days',
      Offering__c = ids.get('o:Drama'),
      AppliesTo__c = appliesTo,
      SortOrder__c = 1
    );
    Database.insert(choice, AccessLevel.USER_MODE);
    List<SObject> rows = new List<SObject>{
      new LinkedChoiceTime__c(
        LinkedChoice__c = choice.Id,
        Weekday__c = 'Monday',
        TimeBlock__c = ids.get('Period 1')
      ),
      new LinkedChoiceTime__c(
        LinkedChoice__c = choice.Id,
        Weekday__c = 'Tuesday',
        TimeBlock__c = ids.get('Period 1')
      )
    };
    if (divisionId != null) {
      rows.add(
        new Coverage__c(
          Season__c = ids.get('Season'),
          LinkedChoice__c = choice.Id,
          Division__c = divisionId
        )
      );
    }
    Database.insert(rows, AccessLevel.USER_MODE);
    return choice;
  }

  /** Every camper in Drama on both days, the first camper's two seats as the linked choice. */
  public ElectiveSeatSaves.AssignRequest firstAsSet(
    Decimal revision,
    Id choiceId
  ) {
    ElectiveSeatSaves.AssignRequest request = everyoneInDrama(revision);
    request.seats[0].linkedChoiceId = choiceId;
    request.seats[1].linkedChoiceId = choiceId;
    return request;
  }

  public Assignment__c mondaySeat(Integer camper) {
    return [
      SELECT
        Offering__c,
        LinkedChoice__c,
        Locked__c,
        ByHand__c,
        ActivityName__c,
        GroupName__c
      FROM Assignment__c
      WHERE
        ElectiveRun__c = :runId
        AND Camper__c = :campers[camper]
        AND Date__c = :MONDAY
    ];
  }
}
