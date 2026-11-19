/**
 * Roots' table (repo ADR 0020), as a scheduler with the Shoresh Scheduler permission set, on a
 * synthetic camp the size of a real one: six weeks, 28 bunks in six divisions, eight time blocks,
 * 25 activities, a Generated and a Manual draft of Week 2 (five days each, Chugim in Period 1 and
 * Lunch for the last bunk), a published Week 1, twenty saved versions, and an elective run with
 * 40 campers seated. No real campers or staff.
 */
@IsTest
private class RootsTableTest {
  private static final Date WEEK_2_MONDAY = Date.newInstance(2026, 7, 6);
  private static final Integer GROUPS_PER_DIVISION = 5;
  private static final Integer CAMPERS = 40;

  private class Camp {
    Map<String, Id> ids;
    List<TimeBlock__c> blocks = new List<TimeBlock__c>();
    List<Group__c> groups = new List<Group__c>();
    List<Activity__c> activities = new List<Activity__c>();
    // The elective set on every draft's grid, and the run seats are added to (electives()).
    Id setId;
    Id runId;

    Camp() {
      Camp__c camp = ShoreshTestData.camp('Camp Synthetic Pines');
      ShoreshTestData.fullSeason(camp.Id);
      ids = ShoreshTestData.lastSeasonIds.clone();
      SetTimeGuard.defer();
      try {
        addBlocks();
        SetTimeGuard.checkPending();
      } finally {
        SetTimeGuard.resume();
      }
      addGroups();
      addActivities();
      ElectiveSet__c chugim = new ElectiveSet__c(
        Season__c = ids.get('Season'),
        Name = 'Chugim'
      );
      Database.insert(chugim, AccessLevel.USER_MODE);
      setId = chugim.Id;
    }

    void addBlocks() {
      List<TimeBlock__c> more = new List<TimeBlock__c>();
      for (Integer hour : new List<Integer>{ 10, 11, 13, 14, 15, 16 }) {
        more.add(
          new TimeBlock__c(
            Program__c = ids.get('Main'),
            Name = 'Period at ' + hour,
            StartTime__c = Time.newInstance(hour, 0, 0, 0),
            EndTime__c = Time.newInstance(hour, 45, 0, 0),
            PartOfDay__c = hour < 12 ? 'Morning' : 'Afternoon',
            SortOrder__c = hour
          )
        );
      }
      Database.insert(more, AccessLevel.SYSTEM_MODE);
      blocks = [
        SELECT Id, Name, StartTime__c, EndTime__c
        FROM TimeBlock__c
        WHERE Program__c = :ids.get('Main')
        WITH SYSTEM_MODE
        ORDER BY StartTime__c
      ];
    }

    void addGroups() {
      List<Division__c> divisions = new List<Division__c>();
      for (Integer d = 0; d < 5; d++) {
        divisions.add(
          new Division__c(
            Program__c = ids.get('Main'),
            Name = 'Division ' + d,
            SortOrder__c = d + 2
          )
        );
      }
      Database.insert(divisions, AccessLevel.SYSTEM_MODE);
      List<Group__c> more = new List<Group__c>();
      for (Division__c division : divisions) {
        for (Integer g = 0; g < GROUPS_PER_DIVISION; g++) {
          more.add(
            new Group__c(
              Division__c = division.Id,
              Name = division.Name + ' bunk ' + g,
              Availability__c = 'MorningOnly',
              SortOrder__c = g
            )
          );
        }
      }
      Database.insert(more, AccessLevel.SYSTEM_MODE);
      groups = [
        SELECT Id, Name
        FROM Group__c
        WHERE Division__r.Program__c = :ids.get('Main')
        WITH SYSTEM_MODE
        ORDER BY Division__r.SortOrder__c, SortOrder__c, Name
      ];
    }

    void addActivities() {
      for (Integer a = 0; a < 25; a++) {
        activities.add(
          ShoreshTestData.activity(ids.get('Season'), 'Activity ' + a, null)
        );
      }
      Database.insert(activities, AccessLevel.SYSTEM_MODE);
    }

    /**
     * A draft of Week 2: five days, each the same grid. Every bunk has an activity in every block,
     * except Lunch, the fixed activity for everyone; the first bunk's first block is locked.
     */
    Id draft(String origin) {
      Schedule__c schedule = new Schedule__c(
        Program__c = ids.get('Main'),
        Week__c = ids.get('Week 2'),
        Name = origin,
        Status__c = 'Draft',
        Origin__c = origin
      );
      Database.insert(schedule, AccessLevel.USER_MODE);
      List<ScheduleDaySaves.DaySave> days = new List<ScheduleDaySaves.DaySave>();
      for (Integer d = 0; d < 5; d++) {
        days.add(
          new ScheduleDaySaves.DaySave(WEEK_2_MONDAY.addDays(d), grid(), null)
        );
      }
      ScheduleDaySaves.write(schedule.Id, days);
      return schedule.Id;
    }

    ScheduleGrid grid() {
      ScheduleGrid grid = new ScheduleGrid();
      for (TimeBlock__c block : blocks) {
        grid.blocks.add(
          new ScheduleGrid.Block(block.Id, block.Name)
            .at(clock(block.StartTime__c), clock(block.EndTime__c))
        );
      }
      for (Activity__c activity : activities) {
        grid.items.add(new ScheduleGrid.Item('A', activity.Id, activity.Name));
      }
      grid.items.add(new ScheduleGrid.Item('F', ids.get('Lunch'), 'Lunch'));
      grid.items.add(new ScheduleGrid.Item('E', setId, 'Chugim'));
      for (Integer g = 0; g < groups.size(); g++) {
        grid.groups.add(
          new ScheduleGrid.GroupRef(groups[g].Id, groups[g].Name)
        );
        List<String> row = new List<String>();
        for (Integer b = 0; b < blocks.size(); b++) {
          row.add(
            g == groups.size() - 1 && isElectiveBlock(blocks[b].Id)
              ? String.valueOf(activities.size() + 2)
              : blocks[b].Id == ids.get('Lunch')
                  ? String.valueOf(activities.size() + 1)
                  : String.valueOf(Math.mod(g + b, activities.size()) + 1)
          );
        }
        grid.rows.add(row);
      }
      ScheduleGridLocks.lock(grid, new List<Integer>{ 0, 0 });
      return grid;
    }

    /** Period 1 and Lunch: where the last bunk has Chugim. */
    Boolean isElectiveBlock(Id blockId) {
      return blockId == ids.get('Period 1') || blockId == ids.get('Lunch');
    }

    void publishedAndVersions() {
      // Written directly, as Publish would (PublishedGuard).
      PublishedGuard.allow();
      try {
        Database.insert(
          new Schedule__c(
            Program__c = ids.get('Main'),
            Week__c = ids.get('Week 1'),
            Name = 'Week 1',
            Status__c = 'Published',
            Origin__c = 'Manual'
          ),
          AccessLevel.SYSTEM_MODE
        );
      } finally {
        PublishedGuard.done();
      }
      List<Schedule__c> versions = new List<Schedule__c>();
      for (Integer v = 0; v < 20; v++) {
        versions.add(
          new Schedule__c(
            Program__c = ids.get('Main'),
            Week__c = ids.get('Week 2'),
            Name = 'Saved ' + v,
            Status__c = 'Version',
            Origin__c = 'Manual',
            VersionReason__c = 'SavedByHand'
          )
        );
      }
      Database.insert(versions, AccessLevel.SYSTEM_MODE);
    }

    /**
     * Chugim with six offerings; a run of Week 2 seating 40 campers of the last bunk over its two
     * elective times on Monday.
     */
    void electives(Id scheduleId) {
      List<Offering__c> offerings = new List<Offering__c>();
      for (Integer o = 0; o < 6; o++) {
        offerings.add(
          new Offering__c(
            ElectiveSet__c = setId,
            Activity__c = activities[o].Id,
            Seats__c = 12,
            MinimumToRun__c = o == 1 ? 6 : null
          )
        );
      }
      Database.insert(offerings, AccessLevel.USER_MODE);
      ElectiveRun__c run = new ElectiveRun__c(
        Season__c = ids.get('Season'),
        Name = 'Chugim · Week 2',
        ElectiveSet__c = setId,
        Week__c = ids.get('Week 2'),
        Schedule__c = scheduleId,
        Status__c = 'Committed',
        Revision__c = 1
      );
      Database.insert(run, AccessLevel.USER_MODE);
      runId = run.Id;
      List<Camper__c> made = new List<Camper__c>();
      for (Integer c = 0; c < CAMPERS; c++) {
        made.add(
          new Camper__c(
            Season__c = ids.get('Season'),
            Name = 'Synthetic Camper ' + c,
            CamperNumber__c = 'SYN-' + String.valueOf(c).leftPad(4, '0')
          )
        );
      }
      Database.insert(made, AccessLevel.USER_MODE);
      List<Preference__c> prefs = new List<Preference__c>();
      for (Camper__c camper : made) {
        prefs.add(
          new Preference__c(
            ElectiveRun__c = runId,
            Camper__c = camper.Id,
            Group__c = lastGroup()
          )
        );
      }
      Database.insert(prefs, AccessLevel.USER_MODE);
      List<Assignment__c> seats = new List<Assignment__c>();
      for (Integer c = 0; c < CAMPERS; c++) {
        // Period 1: the first offering takes 10, the second 5, the rest share what is left.
        Integer first = c < 10 ? 0 : (c < 15 ? 1 : 2 + Math.mod(c, 4));
        seats.add(seat(made[c].Id, ids.get('Period 1'), offerings[first].Id));
        // Lunch, the bunk's second elective time: the first offering takes 3 there.
        Integer second = c < 3 ? 0 : 2 + Math.mod(c, 4);
        seats.add(seat(made[c].Id, ids.get('Lunch'), offerings[second].Id));
      }
      Database.insert(seats, AccessLevel.USER_MODE);
    }

    Id lastGroup() {
      return groups[groups.size() - 1].Id;
    }

    Assignment__c seat(Id camperId, Id blockId, Id offeringId) {
      return new Assignment__c(
        ElectiveRun__c = runId,
        Camper__c = camperId,
        Group__c = lastGroup(),
        Date__c = WEEK_2_MONDAY,
        TimeBlock__c = blockId,
        Offering__c = offeringId
      );
    }
  }

  private static String clock(Time t) {
    return String.valueOf(t.hour()).leftPad(2, '0') +
      ':' +
      String.valueOf(t.minute()).leftPad(2, '0');
  }

  @IsTest
  static void oneRequestDrawsTheScheduleCardsInAFixedNumberOfQueries() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp camp = new Camp();
      Id generatedId = camp.draft('Generated');
      camp.draft('Manual');
      camp.publishedAndVersions();
      camp.electives(generatedId);
      Test.startTest();
      Integer before = Limits.getQueries();
      RootsTable.Table table = RootsController.getTable(camp.ids.get('Season'));
      Integer queries = Limits.getQueries() - before;
      Test.stopTest();

      // A fixed number of queries whatever the size of the camp, well under 100: the seats card
      // reads its run as Elective seats does (ElectiveRunState, ELECT-4.11).
      Assert.isTrue(queries <= 20, 'Roots read with ' + queries + ' queries');
      // Outside the season: no week is this week; the cards show the first week with a draft.
      Assert.isNull(table.thisWeekId);
      Assert.areEqual(camp.ids.get('Week 2'), table.shownWeekId);
      Assert.areEqual(
        new List<Id>{ camp.ids.get('Week 1'), camp.ids.get('Week 2') },
        table.builtWeekIds
      );

      for (
        RootsTable.Glimpse glimpse : new List<RootsTable.Glimpse>{
          table.generated,
          table.manual
        }
      ) {
        Assert.areEqual(RootsGlimpses.GLIMPSE_GROUPS, glimpse.groups.size());
        Assert.areEqual(camp.groups[0].Name, glimpse.groups[0]);
        Assert.areEqual(RootsGlimpses.GLIMPSE_BLOCKS, glimpse.rows.size());
        Assert.areEqual('09:00', glimpse.rows[0].startTime);
        Assert.areEqual('Activity 0', glimpse.rows[0].cells[0].name);
        Assert.isTrue(glimpse.rows[0].cells[0].locked);
        Assert.isFalse(glimpse.rows[0].cells[1].locked);
        // Lunch is the fixed activity everyone has: one row, named once.
        Integer lunch = 0;
        for (RootsTable.Row row : glimpse.rows) {
          if (row.fixed == 'Lunch') {
            lunch++;
          }
        }
        Assert.areEqual(1, lunch);
      }

      Assert.isNotNull(table.latestVersion);
      Assert.areEqual(camp.ids.get('Week 2'), table.latestVersion.weekId);

      assertSeats(table, camp);
    }
  }

  /** The seats card's offerings, and for the hand the ones kept below their minimum. */
  private static void assertSeats(RootsTable.Table table, Camp camp) {
    Assert.areEqual(RootsSeats.SEAT_ROWS, table.seats.size());
    Assert.areEqual('Activity 0', table.seats[0].name);
    Assert.areEqual(12, table.seats[0].seats);
    // The most it holds at any one time: 10 in Period 1, not 13 over the day.
    Assert.areEqual(10, table.seats[0].taken);
    Assert.areEqual(6, table.seats[1].minimum);
    Assert.areEqual(5, table.seats[1].taken);

    // The hand: the one offering kept below its minimum (5 of 6 at its only time), with the
    // run's set and week; and no week close at hand outside the season.
    Assert.areEqual(1, table.shortSeats.size());
    Assert.areEqual('Activity 1', table.shortSeats[0].name);
    Assert.areEqual(5, table.shortSeats[0].fewest);
    Assert.areEqual(6, table.shortSeats[0].minimum);
    Assert.areEqual(camp.ids.get('Week 2'), table.seatsWeekId);
    Assert.isNotNull(table.seatsSetId);
    Assert.isTrue(table.soonWeekIds.isEmpty());
  }

  @IsTest
  static void theSeatsAreTheRunElectiveSeatsOpensOn() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp camp = new Camp();
      Id generatedId = camp.draft('Generated');
      Id manualId = camp.draft('Manual');
      camp.electives(generatedId);
      Id setId = [
        SELECT ElectiveSet__c
        FROM ElectiveRun__c
        WHERE Id = :camp.runId
      ]
      .ElectiveSet__c;
      // Run A is committed (one offering short); run B, a later run on the same schedule that is
      // not the committed one, has no seats. Elective seats opens on A, so the hand counts A.
      ElectiveRun__c later = run(camp, setId, generatedId);
      Database.insert(later, AccessLevel.USER_MODE);
      Test.setCreatedDate(camp.runId, Datetime.now().addDays(-2));
      Test.setCreatedDate(later.Id, Datetime.now().addDays(-1));
      Test.startTest();
      Integer before = Limits.getQueries();
      RootsTable.Table table = RootsController.getTable(camp.ids.get('Season'));
      Integer queries = Limits.getQueries() - before;
      Assert.isTrue(queries <= 20, 'Roots read with ' + queries + ' queries');
      Assert.areEqual(camp.runId, table.seatsRunId);
      Assert.areEqual(generatedId, table.seatsScheduleId);
      Assert.areEqual(setId, table.seatsSetId);
      Assert.areEqual(1, table.shortSeats.size());

      // A newer run on the week's other schedule: Elective seats opens on that schedule, on
      // which nothing is short.
      ElectiveRun__c other = run(camp, setId, manualId);
      Database.insert(other, AccessLevel.USER_MODE);
      table = RootsController.getTable(camp.ids.get('Season'));
      Test.stopTest();
      Assert.areEqual(other.Id, table.seatsRunId);
      Assert.areEqual(manualId, table.seatsScheduleId);
      Assert.isTrue(table.shortSeats.isEmpty());
    }
  }

  @IsTest
  static void zeroSeatsAreNoLimitOnTheSeatsCard() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp camp = new Camp();
      camp.electives(camp.draft('Generated'));
      // 0 seats is no limit, as the seat run uses it (engine care PR 8): never drawn as over.
      Offering__c first = [
        SELECT Id
        FROM Offering__c
        WHERE Activity__r.Name = 'Activity 0'
        WITH USER_MODE
        LIMIT 1
      ];
      first.Seats__c = 0;
      Database.update(first, AccessLevel.USER_MODE);

      Test.startTest();
      RootsTable.Table table = RootsController.getTable(camp.ids.get('Season'));
      Test.stopTest();

      RootsTable.Seat shown = null;
      for (RootsTable.Seat seat : table.seats) {
        if (seat.name == 'Activity 0') {
          shown = seat;
        }
      }
      Assert.isNotNull(shown, 'Activity 0 is on the seats card');
      Assert.isNull(shown.seats, 'No limit, not 0');
      Assert.areEqual(10, shown.taken);
    }
  }

  /** A run of Week 2 that is not the committed one. */
  private static ElectiveRun__c run(Camp camp, Id setId, Id scheduleId) {
    return new ElectiveRun__c(
      Season__c = camp.ids.get('Season'),
      Name = 'Chugim · Week 2 · Final',
      ElectiveSet__c = setId,
      Week__c = camp.ids.get('Week 2'),
      Schedule__c = scheduleId,
      Status__c = 'Final',
      Revision__c = 1
    );
  }

  @IsTest
  static void anotherWeeksRunNeverShowsAsTheShownWeeksSeats() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp camp = new Camp();
      Id generatedId = camp.draft('Generated');
      camp.electives(generatedId);
      // The only run is Week 1's (against a saved version of Week 1); the cards show Week 2.
      Schedule__c week1 = new Schedule__c(
        Program__c = camp.ids.get('Main'),
        Week__c = camp.ids.get('Week 1'),
        Name = 'Week 1 version',
        Status__c = 'Version',
        Origin__c = 'Manual'
      );
      Database.insert(week1, AccessLevel.USER_MODE);
      Database.update(
        new ElectiveRun__c(
          Id = camp.runId,
          Week__c = camp.ids.get('Week 1'),
          Schedule__c = week1.Id
        ),
        AccessLevel.USER_MODE
      );
      Test.startTest();
      RootsTable.Table table = RootsController.getTable(camp.ids.get('Season'));
      Test.stopTest();
      Assert.areEqual(camp.ids.get('Week 2'), table.shownWeekId);
      Assert.isTrue(table.seats.isEmpty());
    }
  }

  @IsTest
  static void aCampWithOnlySetupHasNoScheduleGlimpses() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Synthetic Brook');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Test.startTest();
      RootsTable.Table table = RootsController.getTable(season.Id);
      Test.stopTest();
      Assert.areEqual(
        ShoreshTestData.lastSeasonIds.get('Week 1'),
        table.shownWeekId
      );
      Assert.isTrue(table.builtWeekIds.isEmpty());
      Assert.isNull(table.generated);
      Assert.isNull(table.manual);
      Assert.isTrue(table.seats.isEmpty());
      Assert.isNull(table.latestVersion);
    }
  }

  @IsTest
  static void duringTheSeasonTheCardsShowThisWeek() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Synthetic Lake');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      // Wednesday of Week 3.
      RootsTable.todayForTest = Date.newInstance(2026, 7, 15);
      Test.startTest();
      RootsTable.Table table = RootsController.getTable(season.Id);
      Test.stopTest();
      Assert.areEqual(
        ShoreshTestData.lastSeasonIds.get('Week 3'),
        table.thisWeekId
      );
      Assert.areEqual(
        ShoreshTestData.lastSeasonIds.get('Week 3'),
        table.shownWeekId
      );
      // Close at hand: this week, and next week (it starts in five days).
      Assert.areEqual(
        new List<Id>{
          ShoreshTestData.lastSeasonIds.get('Week 3'),
          ShoreshTestData.lastSeasonIds.get('Week 4')
        },
        table.soonWeekIds
      );
    }
  }

  @IsTest
  static void theFridayBeforeCampTheFirstWeekIsCloseAtHand() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Synthetic Meadow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      RootsTable.todayForTest = Date.newInstance(2026, 6, 26);
      Test.startTest();
      RootsTable.Table table = RootsController.getTable(season.Id);
      Test.stopTest();
      Assert.isNull(table.thisWeekId);
      Assert.areEqual(
        new List<Id>{ ShoreshTestData.lastSeasonIds.get('Week 1') },
        table.soonWeekIds
      );
    }
  }

  @IsTest
  static void aSeasonWithNoWeeksIsAnEmptyTable() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Synthetic Field');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
      Test.startTest();
      RootsTable.Table table = RootsController.getTable(season.Id);
      Test.stopTest();
      Assert.isNull(table.shownWeekId);
      Assert.isTrue(table.builtWeekIds.isEmpty());
    }
  }

  // ELECT-4.11
  @IsTest
  static void twoDivisionsInOneBlockAreCountedAsElectiveSeatsCountsThem() {
    System.runAs(ShoreshTestData.scheduler()) {
      // Chugim on Monday's Period 1 for Group A (Juniors) and Group B, moved to a division of
      // its own: two elective times then, one a division. Campers 0, 2, 4, 6 are in Group A;
      // 1, 3, 5, 7 in Group B.
      ElectiveSeatsCamp camp = new ElectiveSeatsCamp(8);
      Division__c seniors = new Division__c(
        Program__c = camp.ids.get('Main'),
        Name = 'Seniors'
      );
      insert as user seniors;
      update as user new Group__c(
        Id = camp.ids.get('Group B'),
        Division__c = seniors.Id
      );
      // Archery (2 seats): 2 of Group A, 1 of Group B. Pottery (at least 3): 2 of each.
      Map<Integer, String> seated = new Map<Integer, String>{
        0 => 'Archery',
        2 => 'Archery',
        1 => 'Archery',
        4 => 'Pottery',
        6 => 'Pottery',
        3 => 'Pottery',
        5 => 'Pottery',
        7 => 'Drama'
      };
      List<Assignment__c> seats = new List<Assignment__c>();
      for (Integer camper : seated.keySet()) {
        ElectiveSeatSaves.SeatIn at = camp.seat(
          camper,
          Date.newInstance(2026, 6, 29),
          seated.get(camper)
        );
        seats.add(
          new Assignment__c(
            ElectiveRun__c = camp.runId,
            Camper__c = at.camperId,
            Date__c = at.day,
            TimeBlock__c = at.blockId,
            Offering__c = at.offeringId
          )
        );
      }
      insert as user seats;

      Test.startTest();
      Integer before = Limits.getQueries();
      RootsTable.Table table = RootsController.getTable(camp.ids.get('Season'));
      Integer queries = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(queries <= 20, 'Roots read with ' + queries + ' queries');
      Map<String, RootsTable.Seat> byName = new Map<String, RootsTable.Seat>();
      for (RootsTable.Seat seat : table.seats) {
        byName.put(seat.name, seat);
      }
      // Each division's time on its own, as Elective seats shows them: Archery holds 2 of 2 at
      // most (not 3, over), and Pottery 2 at each time, kept below its minimum (not 4).
      Assert.areEqual(2, byName.get('Archery').taken, JSON.serialize(table));
      Assert.areEqual(2, byName.get('Pottery').taken);
      Assert.areEqual(1, table.shortSeats.size(), JSON.serialize(table));
      Assert.areEqual('Pottery', table.shortSeats[0].name);
      Assert.areEqual(2, table.shortSeats[0].fewest);
    }
  }

  @IsTest
  static void someoneWithoutShoreshAccessIsRefusedInPlainWords() {
    Camp__c camp = ShoreshTestData.camp('Camp Synthetic Ridge');
    Season__c season = ShoreshTestData.fullSeason(camp.Id);
    System.runAs(ShoreshTestData.outsider()) {
      String message;
      Test.startTest();
      try {
        RootsController.getTable(season.Id);
      } catch (AuraHandledException e) {
        message = e.getMessage();
      }
      Test.stopTest();
      Assert.isNotNull(message, 'An outsider must not read the table');
      Assert.isFalse(message.contains('__c'), message);
    }
  }
}
