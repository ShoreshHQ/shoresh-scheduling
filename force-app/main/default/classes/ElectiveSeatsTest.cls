/**
 * Elective seats (electives slice E7; repo ADR 0018 choices 28 to 37): the run as the screen reads
 * it, Assign seats and what its save checks, a seat moved or locked by hand, Finalize and its
 * refusals, Start a new version, and linked choices' seats (slice E8). Every test acts as a
 * scheduler with only the Shoresh Scheduler permission set and makes its records inside the same
 * runAs; requests are bounded in queries for a camp of 260 campers. Names and numbers are made up.
 */
@IsTest
private class ElectiveSeatsTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);
  private static final Date TUESDAY = MONDAY.addDays(1);

  /**
   * Week 1 of a season with "Chugim" in Period 1 on Monday and Tuesday for Group A and Group B
   * (one division, Juniors): Archery (2 seats), Drama (no limit), Pottery (10 seats, at least 3)
   * and Ceramics (proposed, not confirmed). A committed run with the campers asked for, each in
   * Group A or B, every one choosing Drama first.
   */
  private class SeatsCamp {
    Map<String, Id> ids;
    Id setId;
    Id scheduleId;
    Id runId;
    List<Id> campers = new List<Id>();

    SeatsCamp(Integer camperCount) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      ShoreshTestData.fullSeason(camp.Id);
      ids = ShoreshTestData.lastSeasonIds.clone();
      makeMenu();
      makeSchedule();
      makeRun(camperCount);
    }

    void makeMenu() {
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

    void makeSchedule() {
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
    ScheduleGrid grid(List<String> rows) {
      ScheduleGrid result = new ScheduleGrid();
      result.blocks.add(
        new ScheduleGrid.Block(ids.get('Period 1'), 'Period 1')
          .at('09:00', '09:45')
      );
      result.blocks.add(
        new ScheduleGrid.Block(ids.get('Lunch'), 'Lunch').at('12:00', '12:45')
      );
      result.groups.add(
        new ScheduleGrid.GroupRef(ids.get('Group A'), 'Group A')
      );
      result.groups.add(
        new ScheduleGrid.GroupRef(ids.get('Group B'), 'Group B')
      );
      result.items.add(new ScheduleGrid.Item('E', setId, 'Chugim'));
      for (String row : rows) {
        result.rows.add(row.split(',', -1));
      }
      return result;
    }

    void makeRun(Integer camperCount) {
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

    ElectiveSeatSaves.SeatIn seat(Integer camper, Date day, String activity) {
      ElectiveSeatSaves.SeatIn result = new ElectiveSeatSaves.SeatIn();
      result.camperId = campers[camper];
      result.day = day;
      result.blockId = ids.get('Period 1');
      result.offeringId = ids.get('o:' + activity);
      return result;
    }

    /** Every camper in Drama on both days: what the engine gives for these choices. */
    ElectiveSeatSaves.AssignRequest everyoneInDrama(Decimal revision) {
      ElectiveSeatSaves.AssignRequest request = new ElectiveSeatSaves.AssignRequest();
      request.runId = runId;
      request.revision = revision;
      for (Integer i = 0; i < campers.size(); i++) {
        request.seats.add(seat(i, MONDAY, 'Drama'));
        request.seats.add(seat(i, TUESDAY, 'Drama'));
      }
      return request;
    }

    ElectiveSeats.RunView assign(ElectiveSeatSaves.AssignRequest request) {
      return ElectiveSeatsController.assignSeats(JSON.serialize(request));
    }

    /** Moves a camper's Monday seat to another offering by hand. */
    ElectiveSeats.RunView move(
      Decimal revision,
      Integer camper,
      String activity
    ) {
      ElectiveSeatChange.ChangeRequest request = mondayChange(revision, camper);
      request.offeringId = ids.get('o:' + activity);
      return ElectiveSeatsController.changeSeat(JSON.serialize(request));
    }

    /** Locks or unlocks a camper's Monday seat. */
    ElectiveSeats.RunView lock(
      Decimal revision,
      Integer camper,
      Boolean locked
    ) {
      ElectiveSeatChange.ChangeRequest request = mondayChange(revision, camper);
      request.locked = locked;
      return ElectiveSeatsController.changeSeat(JSON.serialize(request));
    }

    ElectiveSeatChange.ChangeRequest mondayChange(
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
    LinkedChoice__c dramaBothDays(String appliesTo, Id divisionId) {
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
    ElectiveSeatSaves.AssignRequest firstAsSet(Decimal revision, Id choiceId) {
      ElectiveSeatSaves.AssignRequest request = everyoneInDrama(revision);
      request.seats[0].linkedChoiceId = choiceId;
      request.seats[1].linkedChoiceId = choiceId;
      return request;
    }

    Assignment__c mondaySeat(Integer camper) {
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

  private static String refusalOf(Callable call) {
    try {
      call.call('run', null);
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    Assert.fail('Refused');
    return null;
  }

  /** Sends one assign request (for refusalOf). */
  private class Assigning implements Callable {
    SeatsCamp camp;
    ElectiveSeatSaves.AssignRequest request;
    Assigning(SeatsCamp camp, ElectiveSeatSaves.AssignRequest request) {
      this.camp = camp;
      this.request = request;
    }
    public Object call(String action, Map<String, Object> args) {
      return camp.assign(request);
    }
  }

  // ---------------------------------------------------------------- the read

  @IsTest
  static void theRunIsReadWithItsTimesOfferingsAndCampers() {
    System.runAs(ShoreshTestData.scheduler()) {
      SeatsCamp camp = new SeatsCamp(4);

      Test.startTest();
      Integer before = Limits.getQueries();
      ElectiveSeats.Situation situation = ElectiveSeatsController.seatsSetup(
        camp.ids.get('Season')
      );
      ElectiveSeats.RunView view = ElectiveSeatsController.openRun(camp.runId);
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 10, 'The read is bounded: ' + used);
      Assert.areEqual(1, situation.runs.size());
      Assert.areEqual('Committed', situation.runs[0].status);
      // One time per day, block and division: Monday and Tuesday's Period 1, both bunks in it.
      Assert.areEqual(2, view.times.size());
      Assert.areEqual(MONDAY, view.times[0].day);
      Assert.areEqual(TUESDAY, view.times[1].day);
      Assert.areEqual(2, view.times[0].groupIds.size());
      Assert.areEqual(
        String.valueOf(camp.ids.get('Period 1')),
        view.times[0].blockId
      );
      // Ceramics is only proposed: offered nowhere yet.
      Assert.areEqual(3, view.times[0].offeringIds.size());
      Assert.isFalse(
        view.times[0].offeringIds.contains(camp.ids.get('o:Ceramics'))
      );
      Assert.areEqual(4, view.offerings.size());
      Assert.areEqual(4, view.campers.size());
      Assert.isFalse(view.assigned, 'No seats yet');
      Assert.isFalse(view.scheduleChanged);
      Assert.areEqual(0, view.seats.size());
    }
  }

  @IsTest
  static void anOfferingClosedToADivisionIsNotOfferedThere() {
    System.runAs(ShoreshTestData.scheduler()) {
      SeatsCamp camp = new SeatsCamp(2);
      Division__c seniors = ShoreshTestData.division(
        camp.ids.get('Main'),
        'Seniors'
      );
      Database.insert(
        new ActivityEligibility__c(
          Activity__c = camp.ids.get('Archery'),
          Division__c = seniors.Id
        ),
        AccessLevel.USER_MODE
      );

      ElectiveSeats.RunView view = ElectiveSeatsController.openRun(camp.runId);

      Assert.isFalse(
        view.times[0].offeringIds.contains(camp.ids.get('o:Archery'))
      );
      ElectiveSeatSaves.AssignRequest request = camp.everyoneInDrama(1);
      request.seats[0] = camp.seat(0, MONDAY, 'Archery');
      Assert.areEqual(
        'A seat is in something not offered then. Reload the page.',
        refusalOf(new Assigning(camp, request))
      );
    }
  }

  // ---------------------------------------------------------------- Assign seats

  @IsTest
  static void aBigCampsSeatsAreSavedWithinTheQueryBudget() {
    System.runAs(ShoreshTestData.scheduler()) {
      SeatsCamp camp = new SeatsCamp(260);
      String sent = JSON.serialize(camp.everyoneInDrama(1));

      Test.startTest();
      Integer before = Limits.getQueries();
      ElectiveSeats.RunView view = ElectiveSeatsController.assignSeats(sent);
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 30, 'Assign stays bounded: ' + used);
      Assert.areEqual(520, view.seats.size());
      Assert.areEqual(2, view.revision);
      Assert.isTrue(view.assigned);
      ElectiveRun__c run = [
        SELECT TimesFingerprint__c, EngineVersion__c
        FROM ElectiveRun__c
        WHERE Id = :camp.runId
      ];
      Assert.areEqual(64, run.TimesFingerprint__c.length());
      Assert.areEqual(ElectiveSeatSaves.ENGINE_VERSION, run.EngineVersion__c);
    }
  }

  @IsTest
  static void assignRefusesMoreCampersThanSeats() {
    System.runAs(ShoreshTestData.scheduler()) {
      SeatsCamp camp = new SeatsCamp(3);
      ElectiveSeatSaves.AssignRequest request = camp.everyoneInDrama(1);
      for (Integer i = 0; i < 3; i++) {
        request.seats[i * 2] = camp.seat(i, MONDAY, 'Archery');
      }

      Assert.areEqual(
        '"Archery" has more campers than seats on Monday, Period 1. Assign again.',
        refusalOf(new Assigning(camp, request))
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Assignment__c WHERE ElectiveRun__c = :camp.runId]
      );
    }
  }

  @IsTest
  static void assignRefusesSeatsWhereTheSetIsNot() {
    System.runAs(ShoreshTestData.scheduler()) {
      SeatsCamp camp = new SeatsCamp(2);
      ElectiveSeatSaves.AssignRequest lunch = camp.everyoneInDrama(1);
      lunch.seats[0].blockId = camp.ids.get('Lunch');
      ElectiveSeatSaves.AssignRequest proposed = camp.everyoneInDrama(1);
      proposed.seats[0] = camp.seat(0, MONDAY, 'Ceramics');
      ElectiveSeatSaves.AssignRequest twice = camp.everyoneInDrama(1);
      twice.seats.add(camp.seat(0, MONDAY, 'Pottery'));
      ElectiveSeatSaves.AssignRequest stale = camp.everyoneInDrama(7);

      Assert.areEqual(
        'A seat is at a time when that camper has no Chugim on the schedule. Reload the page.',
        refusalOf(new Assigning(camp, lunch))
      );
      Assert.areEqual(
        'A seat is in something not offered then. Reload the page.',
        refusalOf(new Assigning(camp, proposed))
      );
      Assert.areEqual(
        'Two seats were sent for one camper at one time. Assign again.',
        refusalOf(new Assigning(camp, twice))
      );
      Assert.areEqual(
        'Someone else changed these seats since you opened them. Reload the page to see them.',
        refusalOf(new Assigning(camp, stale))
      );
    }
  }

  @IsTest
  static void assignAgainAtSizeWritesOnlyWhatChanged() {
    System.runAs(ShoreshTestData.scheduler()) {
      // 500 campers, two times each: 1,000 seats.
      SeatsCamp camp = new SeatsCamp(500);
      ElectiveSeats.RunView view = camp.assign(camp.everyoneInDrama(1));
      Assert.areEqual(1000, view.seats.size());
      ElectiveSeatSaves.AssignRequest again = camp.everyoneInDrama(
        view.revision
      );
      // Three campers move to Pottery on Monday; everyone else stays where they are.
      for (Integer i = 0; i < 3; i++) {
        again.seats[i * 2].offeringId = camp.ids.get('o:Pottery');
      }

      Test.startTest();
      Integer rowsBefore = Limits.getDmlRows();
      Integer queriesBefore = Limits.getQueries();
      view = camp.assign(again);
      Integer rows = Limits.getDmlRows() - rowsBefore;
      Integer queries = Limits.getQueries() - queriesBefore;
      Test.stopTest();

      Assert.isTrue(rows <= 4, 'Three seats and the run: ' + rows);
      Assert.isTrue(queries <= 20, 'Assign again is bounded: ' + queries);
      Assert.areEqual(1000, view.seats.size());
      Assert.areEqual(
        camp.ids.get('o:Pottery'),
        camp.mondaySeat(2).Offering__c
      );
      Assert.areEqual(camp.ids.get('o:Drama'), camp.mondaySeat(3).Offering__c);
    }
  }

  @IsTest
  static void assignRefusesCalmlyWhenTooManyRowsWouldChange() {
    System.runAs(ShoreshTestData.scheduler()) {
      SeatsCamp camp = new SeatsCamp(4);
      ElectiveSeatSaves.rowBound = 5;
      Test.startTest();
      // Eight new seats and the run: nine rows, past the bound.
      String refusal = refusalOf(new Assigning(camp, camp.everyoneInDrama(1)));
      Test.stopTest();
      Assert.areEqual(
        'Too many seats change to save at once (9; the most is 5). Nothing was changed.',
        refusal
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Assignment__c WHERE ElectiveRun__c = :camp.runId]
      );
    }
  }

  @IsTest
  static void assignAgainKeepsEveryLock() {
    System.runAs(ShoreshTestData.scheduler()) {
      SeatsCamp camp = new SeatsCamp(3);
      ElectiveSeats.RunView view = camp.assign(camp.everyoneInDrama(1));
      // Camper 0 moved to Archery by hand: locked.
      view = camp.move(view.revision, 0, 'Archery');
      Assignment__c moved = camp.mondaySeat(0);
      Assert.areEqual(camp.ids.get('o:Archery'), moved.Offering__c);
      Assert.isTrue(
        moved.Locked__c && moved.ByHand__c,
        'A move is a hand move, locked'
      );

      // Assign again with no seat for camper 0 on Monday: the lock stays as it was.
      ElectiveSeatSaves.AssignRequest again = camp.everyoneInDrama(
        view.revision
      );
      again.seats.remove(0);
      view = camp.assign(again);
      Assert.areEqual(
        camp.ids.get('o:Archery'),
        camp.mondaySeat(0).Offering__c
      );
      Assert.areEqual(6, view.seats.size());

      // A request that changes the lock is refused.
      ElectiveSeatSaves.AssignRequest changing = camp.everyoneInDrama(
        view.revision
      );
      Assert.areEqual(
        'A locked seat was changed. Reload the page and assign again.',
        refusalOf(new Assigning(camp, changing))
      );
    }
  }

  @IsTest
  static void locksHoldSeatsTheEngineMayNotFill() {
    System.runAs(ShoreshTestData.scheduler()) {
      SeatsCamp camp = new SeatsCamp(4);
      ElectiveSeats.RunView view = camp.assign(camp.everyoneInDrama(1));
      // Two locked into Archery's two seats by hand: a third from Assign is one too many.
      view = camp.move(view.revision, 0, 'Archery');
      view = camp.move(view.revision, 1, 'Archery');
      ElectiveSeatSaves.AssignRequest request = camp.everyoneInDrama(
        view.revision
      );
      request.seats[0] = camp.seat(0, MONDAY, 'Archery');
      request.seats[2] = camp.seat(1, MONDAY, 'Archery');
      request.seats[4] = camp.seat(2, MONDAY, 'Archery');

      Assert.areEqual(
        '"Archery" has more campers than seats on Monday, Period 1. Assign again.',
        refusalOf(new Assigning(camp, request))
      );
    }
  }

  // ---------------------------------------------------------------- by hand

  @IsTest
  static void aMoveByHandMayGoOverSeatsAndThePadlockUnlocks() {
    System.runAs(ShoreshTestData.scheduler()) {
      SeatsCamp camp = new SeatsCamp(3);
      ElectiveSeats.RunView view = camp.assign(camp.everyoneInDrama(1));
      // Each change by hand is its own request: they get their own limits here.
      Test.startTest();
      for (Integer i = 0; i < 3; i++) {
        view = camp.move(view.revision, i, 'Archery');
      }
      Assert.areEqual(
        3,
        [
          SELECT COUNT()
          FROM Assignment__c
          WHERE
            ElectiveRun__c = :camp.runId
            AND Offering__c = :camp.ids.get('o:Archery')
        ],
        'Over its seats by hand: shown, not refused'
      );

      view = camp.lock(view.revision, 2, false);
      Assignment__c seat = camp.mondaySeat(2);
      Assert.isFalse(seat.Locked__c, 'Unlocked');
      Assert.isTrue(seat.ByHand__c, 'Still the move made by hand');
      Assert.areEqual(camp.ids.get('o:Archery'), seat.Offering__c);
      Test.stopTest();
    }
  }

  // ---------------------------------------------------------------- Finalize

  @IsTest
  static void finalizeFixesTheSeatsWithAVersionAndNames() {
    System.runAs(ShoreshTestData.scheduler()) {
      SeatsCamp camp = new SeatsCamp(260);
      ElectiveSeats.RunView view = camp.assign(camp.everyoneInDrama(1));

      Test.startTest();
      Integer before = Limits.getQueries();
      view = ElectiveSeatsController.finalizeRun(camp.runId, view.revision);
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 50, 'Finalize stays bounded: ' + used);
      Assert.areEqual('Final', view.run.status);
      Assert.isNotNull(view.run.finalizedAt);
      ElectiveRun__c run = [
        SELECT
          FinalSchedule__c,
          FinalSchedule__r.Status__c,
          FinalSchedule__r.VersionReason__c,
          FinalizedBy__c
        FROM ElectiveRun__c
        WHERE Id = :camp.runId
      ];
      Assert.areEqual('Version', run.FinalSchedule__r.Status__c);
      Assert.areEqual(
        'ElectivesFinalized',
        run.FinalSchedule__r.VersionReason__c
      );
      Assert.areEqual(UserInfo.getUserId(), run.FinalizedBy__c);
      Assert.areEqual(
        2,
        [
          SELECT COUNT()
          FROM ScheduleDay__c
          WHERE Schedule__c = :run.FinalSchedule__c
        ]
      );
      Assignment__c seat = camp.mondaySeat(0);
      Assert.areEqual('Drama', seat.ActivityName__c);
      Assert.areEqual('Group A', seat.GroupName__c);
      Assert.areEqual(2, view.times.size(), 'Shown from the version kept');

      // A final run never changes.
      Assert.areEqual(
        '"Chugim · Week 1" is final, so its seats can\'t change. Start a new version first.',
        refusalOf(new Assigning(camp, camp.everyoneInDrama(view.revision)))
      );
    }
  }

  @IsTest
  static void finalizeIsRefusedWhenTheScheduleChanged() {
    System.runAs(ShoreshTestData.scheduler()) {
      SeatsCamp camp = new SeatsCamp(2);
      ElectiveSeats.RunView view = camp.assign(camp.everyoneInDrama(1));
      // Tuesday's Chugim taken off Group B.
      ScheduleDaySaves.write(
        camp.scheduleId,
        new List<ScheduleDaySaves.DaySave>{
          new ScheduleDaySaves.DaySave(
            TUESDAY,
            camp.grid(new List<String>{ '1,', ',' }),
            1
          )
        }
      );

      view = ElectiveSeatsController.openRun(camp.runId);
      Assert.isTrue(view.scheduleChanged, 'Said on the screen');
      String refusal;
      try {
        ElectiveSeatsController.finalizeRun(camp.runId, view.revision);
      } catch (AuraHandledException e) {
        refusal = e.getMessage();
      }
      Assert.areEqual('Schedule changed. Assign again first.', refusal);
    }
  }

  @IsTest
  static void finalizeIsRefusedWhenAPlaceIsDoubleBooked() {
    System.runAs(ShoreshTestData.scheduler()) {
      SeatsCamp camp = new SeatsCamp(2);
      Location__c range = new Location__c(
        Season__c = camp.ids.get('Season'),
        Name = 'Range',
        GroupsThatFit__c = 1
      );
      Database.insert(range, AccessLevel.USER_MODE);
      Database.update(
        new Activity__c(Id = camp.ids.get('Archery'), Location__c = range.Id),
        AccessLevel.USER_MODE
      );
      ElectiveSeats.RunView view = camp.assign(camp.everyoneInDrama(1));

      String refusal;
      try {
        ElectiveSeatsController.finalizeRun(camp.runId, view.revision);
      } catch (AuraHandledException e) {
        refusal = e.getMessage();
      }
      // Both bunks hold Chugim, so the range holds two groups where one fits.
      Assert.areEqual(
        'Double-booked on the schedule (Range, Monday, Period 1; Range, Tuesday, Period 1). Fix it, then finalize.',
        refusal
      );
      Assert.areEqual(
        'Committed',
        [SELECT Status__c FROM ElectiveRun__c WHERE Id = :camp.runId].Status__c
      );
    }
  }

  @IsTest
  static void finalizeWantsSeatsFirst() {
    System.runAs(ShoreshTestData.scheduler()) {
      SeatsCamp camp = new SeatsCamp(2);
      String refusal;
      try {
        ElectiveSeatsController.finalizeRun(camp.runId, 1);
      } catch (AuraHandledException e) {
        refusal = e.getMessage();
      }
      Assert.areEqual('Assign seats first.', refusal);
    }
  }

  // ---------------------------------------------------------------- linked choices (slice E8)

  @IsTest
  static void aLinkedChoiceIsReadAndItsSeatsSavedAsASet() {
    System.runAs(ShoreshTestData.scheduler()) {
      SeatsCamp camp = new SeatsCamp(2);
      LinkedChoice__c both = camp.dramaBothDays('All', null);

      Test.startTest();
      Integer before = Limits.getQueries();
      ElectiveSeats.RunView view = ElectiveSeatsController.openRun(camp.runId);
      Integer readQueries = Limits.getQueries() - before;
      view = camp.assign(camp.firstAsSet(view.revision, both.Id));
      Test.stopTest();

      Assert.isTrue(readQueries <= 9, 'The read is bounded: ' + readQueries);
      Assert.areEqual(1, view.linkedChoices.size());
      ElectiveSeats.LinkedChoiceInfo info = view.linkedChoices[0];
      Assert.areEqual('Drama both days', info.name);
      Assert.areEqual(camp.ids.get('o:Drama'), info.offeringId);
      Assert.areEqual('All', info.appliesTo);
      Assert.areEqual(2, info.periods.size());
      Assert.areEqual(both.Id, camp.mondaySeat(0).LinkedChoice__c);
      Assert.isNull(camp.mondaySeat(1).LinkedChoice__c);
      Integer linkedSeats = 0;
      for (ElectiveSeats.SeatInfo seat : view.seats) {
        if (seat.linkedChoiceId == both.Id) {
          linkedSeats++;
        }
      }
      Assert.areEqual(2, linkedSeats, 'Both of its periods');
    }
  }

  @IsTest
  static void assignAgainChangesWhetherASeatIsPartOfALinkedChoice() {
    System.runAs(ShoreshTestData.scheduler()) {
      SeatsCamp camp = new SeatsCamp(2);
      LinkedChoice__c both = camp.dramaBothDays('All', null);
      ElectiveSeats.RunView view = camp.assign(camp.firstAsSet(1, both.Id));

      Test.startTest();
      Integer rowsBefore = Limits.getDmlRows();
      view = camp.assign(camp.everyoneInDrama(view.revision));
      Integer rows = Limits.getDmlRows() - rowsBefore;
      Test.stopTest();

      // The same offering, no longer as a set: changed in place.
      Assert.isNull(camp.mondaySeat(0).LinkedChoice__c);
      Assert.isTrue(rows <= 3, 'Two seats and the run: ' + rows);
    }
  }

  @IsTest
  static void aLinkedChoicesSeatsAreChecked() {
    System.runAs(ShoreshTestData.scheduler()) {
      SeatsCamp camp = new SeatsCamp(2);
      Division__c seniors = ShoreshTestData.division(
        camp.ids.get('Main'),
        'Seniors'
      );
      LinkedChoice__c both = camp.dramaBothDays('All', null);
      String mismatch = 'A seat sent as part of a linked choice doesn\'t match it. Reload the page and assign again.';

      Test.startTest();
      // Only one of its periods.
      ElectiveSeatSaves.AssignRequest half = camp.everyoneInDrama(1);
      half.seats[0].linkedChoiceId = both.Id;
      Assert.areEqual(mismatch, refusalOf(new Assigning(camp, half)));
      // In another offering than its own.
      ElectiveSeatSaves.AssignRequest other = camp.firstAsSet(1, both.Id);
      other.seats[0].offeringId = camp.ids.get('o:Archery');
      other.seats[1].offeringId = camp.ids.get('o:Archery');
      Assert.areEqual(mismatch, refusalOf(new Assigning(camp, other)));
      // For a division it doesn't apply to.
      Database.update(
        new LinkedChoice__c(Id = both.Id, AppliesTo__c = 'OnlyThese'),
        AccessLevel.USER_MODE
      );
      Database.insert(
        new Coverage__c(
          Season__c = camp.ids.get('Season'),
          LinkedChoice__c = both.Id,
          Division__c = seniors.Id
        ),
        AccessLevel.USER_MODE
      );
      Assert.areEqual(
        mismatch,
        refusalOf(new Assigning(camp, camp.firstAsSet(1, both.Id)))
      );
      Test.stopTest();

      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Assignment__c WHERE ElectiveRun__c = :camp.runId],
        'Nothing saved'
      );
    }
  }

  @IsTest
  static void aSeatMovedByHandIsNoLongerPartOfItsLinkedChoice() {
    System.runAs(ShoreshTestData.scheduler()) {
      SeatsCamp camp = new SeatsCamp(2);
      LinkedChoice__c both = camp.dramaBothDays('All', null);
      ElectiveSeats.RunView view = camp.assign(camp.firstAsSet(1, both.Id));

      Test.startTest();
      view = camp.lock(view.revision, 0, true);
      Assert.areEqual(
        both.Id,
        camp.mondaySeat(0).LinkedChoice__c,
        'A lock keeps it'
      );
      view = camp.move(view.revision, 0, 'Archery');
      Test.stopTest();

      Assignment__c moved = camp.mondaySeat(0);
      Assert.isNull(moved.LinkedChoice__c);
      Assert.isTrue(moved.ByHand__c && moved.Locked__c);
      // A linked choice its seats use can't be deleted.
      String refusal;
      try {
        SeasonSetupController.deleteRecord(both.Id);
      } catch (AuraHandledException e) {
        refusal = e.getMessage();
      }
      Assert.isTrue(
        refusal.contains('it has elective runs: "Chugim · Week 1"'),
        refusal
      );
    }
  }

  // ---------------------------------------------------------------- Start a new version

  @IsTest
  static void aNewVersionCarriesChoicesLocksAndHandMoves() {
    System.runAs(ShoreshTestData.scheduler()) {
      SeatsCamp camp = new SeatsCamp(3);
      ElectiveSeats.RunView view = camp.assign(camp.everyoneInDrama(1));
      view = camp.move(view.revision, 0, 'Archery');
      Test.startTest();
      view = ElectiveSeatsController.finalizeRun(camp.runId, view.revision);

      ElectiveSeats.RunView copy = ElectiveSeatsController.startNewVersion(
        camp.runId
      );

      Assert.areNotEqual(camp.runId, copy.run.id);
      Assert.areEqual('Committed', copy.run.status);
      Assert.areEqual(camp.runId, copy.run.newVersionOf);
      Assert.areEqual(3, copy.campers.size(), 'Every camper and their choices');
      Assert.areEqual(1, copy.seats.size(), 'Only the hand move');
      Assert.isTrue(copy.seats[0].locked && copy.seats[0].byHand);
      Assert.isFalse(copy.assigned, 'Assign seats fills the rest');
      // The final run is kept as it was.
      Assert.areEqual(
        6,
        [SELECT COUNT() FROM Assignment__c WHERE ElectiveRun__c = :camp.runId]
      );
      String refusal;
      try {
        ElectiveSeatsController.startNewVersion(camp.runId);
      } catch (AuraHandledException e) {
        refusal = e.getMessage();
      }
      Assert.areEqual(
        'A new version of "Chugim · Week 1" is already being worked on. Choose Committed in the run\'s menu.',
        refusal
      );
      Test.stopTest();
    }
  }

  // ---------------------------------------------------------------- no bunk

  @IsTest
  static void aCamperWithNoBunkTakesTheFirstDivisionsTime() {
    System.runAs(ShoreshTestData.scheduler()) {
      SeatsCamp camp = new SeatsCamp(2);
      Preference__c pref = [
        SELECT Id
        FROM Preference__c
        WHERE ElectiveRun__c = :camp.runId AND Camper__c = :camp.campers[0]
      ];
      Database.update(
        new Preference__c(Id = pref.Id, Group__c = null),
        AccessLevel.USER_MODE
      );

      ElectiveSeats.RunView view = camp.assign(camp.everyoneInDrama(1));

      Assert.areEqual(
        4,
        view.seats.size(),
        'Seated at the one division\'s times'
      );
      Assert.areEqual(
        2,
        [
          SELECT COUNT()
          FROM Assignment__c
          WHERE
            ElectiveRun__c = :camp.runId
            AND Camper__c = :camp.campers[0]
            AND Group__c = NULL
        ]
      );
    }
  }
}
