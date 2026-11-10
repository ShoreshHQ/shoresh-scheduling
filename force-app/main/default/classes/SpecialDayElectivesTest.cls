/**
 * A real elective period inside a special day (repo ADR 0026; SPECIAL-1.3, ELECT-4.8, ELECT-5.6,
 * ELECT-6.4): the set typed into the special day's own schedule as its page saves it, the Elective
 * seats screen's own read, Assign, move, Finalize and what goes out, and the special day taken off
 * its day. Every test acts as a scheduler with only the Shoresh Scheduler permission set and makes
 * its records inside the same runAs. Names and numbers are made up.
 */
@IsTest
private class SpecialDayElectivesTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);
  private static final Date TUESDAY = MONDAY.addDays(1);

  /**
   * Week 1 with Chugim (Archery 2 seats, Drama no limit) in Period 1 on Monday and Tuesday for
   * Group A and Group B; Color War, a special day started from the regular day, put on Tuesday,
   * with Chugim typed into its first time block for both groups; a committed run of two campers.
   */
  private class Camp {
    Map<String, Id> ids;
    Id setId;
    Id dayId;
    Id scheduleId;
    Id runId;
    String firstBlock;
    String firstBlockName;
    List<Id> campers = new List<Id>();

    Camp() {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      ShoreshTestData.fullSeason(camp.Id);
      ids = ShoreshTestData.lastSeasonIds.clone();
      makeMenu();
      makeSchedule();
      dayId = SpecialScheduleTestData.addDay(ids.get('Season'), 'Color War');
      putOn('Tuesday');
      // The plan as it started (setup reads it directly: the screen's own read comes in the tests).
      ScheduleGrid.Block first = SpecialPlans.read(dayId).grid.blocks[0];
      firstBlock = first.id;
      firstBlockName = first.name;
      typeChugim(new List<String>{ 'Group A', 'Group B' });
      makeRun();
    }

    void makeMenu() {
      Activity__c archery = ShoreshTestData.activity(
        ids.get('Season'),
        'Archery',
        null
      );
      Activity__c drama = ShoreshTestData.activity(
        ids.get('Season'),
        'Drama',
        null
      );
      Database.insert(
        new List<Activity__c>{ archery, drama },
        AccessLevel.USER_MODE
      );
      ElectiveSet__c chugim = new ElectiveSet__c(
        Season__c = ids.get('Season'),
        Name = 'Chugim'
      );
      Database.insert(chugim, AccessLevel.USER_MODE);
      setId = chugim.Id;
      List<Offering__c> offerings = new List<Offering__c>{
        new Offering__c(
          ElectiveSet__c = setId,
          Activity__c = archery.Id,
          Seats__c = 2
        ),
        new Offering__c(
          ElectiveSet__c = setId,
          Activity__c = drama.Id,
          NoSeatLimit__c = true
        )
      };
      Database.insert(offerings, AccessLevel.USER_MODE);
      ids.put('Drama', drama.Id);
      ids.put('o:Archery', offerings[0].Id);
      ids.put('o:Drama', offerings[1].Id);
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
          new ScheduleDaySaves.DaySave(MONDAY, regularDay(), null),
          new ScheduleDaySaves.DaySave(TUESDAY, regularDay(), null)
        }
      );
    }

    /** Chugim in Period 1 for both groups. */
    ScheduleGrid regularDay() {
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
      result.rows.add(new List<String>{ '1', '' });
      result.rows.add(new List<String>{ '1', '' });
      return result;
    }

    SpecialDayPlacing.Request onDay(String day) {
      SpecialDayPlacing.Request request = new SpecialDayPlacing.Request();
      request.specialDayId = dayId;
      request.weekId = ids.get('Week 1');
      request.day = day;
      return request;
    }

    void putOn(String day) {
      SpecialPlacingController.putOnDay(onDay(day));
    }

    /** Types Chugim into the special day's first time block, as its page saves typed cells. */
    void typeChugim(List<String> groups) {
      SlotEdits.Edit edit = new SlotEdits.Edit();
      edit.runs = new List<SlotEdits.Run>();
      for (String grp : groups) {
        edit.runs.add(
          SpecialScheduleTestData.run(
            ids.get(grp),
            new List<String>{ firstBlock },
            new List<String>{ 'E:' + setId }
          )
        );
      }
      SpecialScheduleController.saveCells(
        dayId,
        new List<SlotEdits.Edit>{ edit }
      );
    }

    void makeRun() {
      List<Camper__c> made = new List<Camper__c>();
      for (Integer i = 1; i <= 2; i++) {
        made.add(
          new Camper__c(
            Season__c = ids.get('Season'),
            Name = 'Synthetic Camper ' + i,
            CamperNumber__c = 'SYN-000' + i
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
            Group__c = i == 0 ? ids.get('Group A') : ids.get('Group B'),
            Choices__c = '[{"n":"Drama","a":"' +
              ids.get('Drama') +
              '","r":1,"k":"ranked"}]'
          )
        );
      }
      Database.insert(prefs, AccessLevel.USER_MODE);
    }

    /** Every camper in Drama at every time the screen read, as Assign seats sends them. */
    ElectiveSeats.RunView assignEveryoneInDrama() {
      ElectiveSeats.RunView view = ElectiveSeatsController.openRun(runId);
      ElectiveSeatSaves.AssignRequest request = new ElectiveSeatSaves.AssignRequest();
      request.runId = runId;
      request.revision = view.revision;
      for (ElectivePeriod at : view.times) {
        for (Id camperId : campers) {
          ElectiveSeatSaves.SeatIn seat = new ElectiveSeatSaves.SeatIn();
          seat.camperId = camperId;
          seat.day = at.day;
          seat.blockId = at.blockId;
          seat.offeringId = ids.get('o:Drama');
          request.seats.add(seat);
        }
      }
      return ElectiveSeatsController.assignSeats(JSON.serialize(request));
    }

    /** Moves a camper's Tuesday seat, in the special day, by hand (as Move to… does). */
    ElectiveSeats.RunView moveOnTuesday(
      Decimal revision,
      Integer camper,
      String activity
    ) {
      ElectiveSeatChange.ChangeRequest request = new ElectiveSeatChange.ChangeRequest();
      request.runId = runId;
      request.revision = revision;
      request.camperId = campers[camper];
      request.day = TUESDAY;
      request.blockId = firstBlock;
      request.offeringId = ids.get('o:' + activity);
      return ElectiveSeatsController.changeSeat(JSON.serialize(request));
    }

    List<String> timesOf(ElectiveSeats.RunView view) {
      List<String> result = new List<String>();
      for (ElectivePeriod at : view.times) {
        result.add(at.words() + ' (' + at.groupIds.size() + ')');
      }
      return result;
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

  private class Finalizing implements Callable {
    Camp camp;
    Decimal revision;
    Finalizing(Camp camp, Decimal revision) {
      this.camp = camp;
      this.revision = revision;
    }
    public Object call(String action, Map<String, Object> args) {
      return ElectiveSeatsController.finalizeRun(camp.runId, revision);
    }
  }

  private class TypingInAnEvent implements Callable {
    Id setId;
    Id eventId;
    String blockId;
    TypingInAnEvent(Id setId, Id eventId, String blockId) {
      this.setId = setId;
      this.eventId = eventId;
      this.blockId = blockId;
    }
    public Object call(String action, Map<String, Object> args) {
      return SpecialScheduleController.saveCells(
        eventId,
        SpecialScheduleTestData.edits(
          SpecialScheduleTestData.run(
            's1',
            new List<String>{ blockId },
            new List<String>{ 'E:' + setId }
          )
        )
      );
    }
  }

  // SPECIAL-1.3, ELECT-4.8
  @IsTest
  static void aSetInASpecialDayIsAnElectiveTimeInsteadOfTheCellsUnderIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp camp = new Camp();

      Test.startTest();
      Integer before = Limits.getQueries();
      ElectiveSeats.RunView view = ElectiveSeatsController.openRun(camp.runId);
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 12, 'The read is bounded: ' + used);
      // The special day's grid holds the set, saved as the set, not an activity named for it.
      ScheduleViews.DayView plan = SpecialScheduleController.openPlan(
          camp.dayId
        )
        .schedule.days[0];
      Assert.areEqual(
        new List<String>{
          'Group A: Chugim' + cellsAfterFirst(plan),
          'Group B: Chugim' + cellsAfterFirst(plan)
        },
        SpecialScheduleTestData.cells(plan)
      );
      Assert.areEqual('E', plan.items[0].kind);
      Assert.areEqual(String.valueOf(camp.setId), plan.items[0].id);
      // Tuesday's time is the special day's own block; the regular Period 1 under it is not one.
      Assert.areEqual(
        new List<String>{
          'Monday, Period 1 (2)',
          'Tuesday, ' +
          camp.firstBlockName +
          ' (2)'
        },
        camp.timesOf(view)
      );
      Assert.areEqual(camp.firstBlock, view.times[1].blockId);
      Assert.areEqual(2, view.times[1].offeringIds.size());
    }
  }

  /** ",,…" for the special day's blocks after the first, all open. */
  private static String cellsAfterFirst(ScheduleViews.DayView plan) {
    String result = '';
    for (Integer b = 1; b < plan.blocks.size(); b++) {
      result += ',';
    }
    return result;
  }

  // SPECIAL-1.3
  @IsTest
  static void anEventsScheduleRefusesASet() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c campRecord = ShoreshTestData.camp('Camp Willow');
      ShoreshTestData.fullSeason(campRecord.Id);
      Map<String, Id> ids = ShoreshTestData.lastSeasonIds.clone();
      ElectiveSet__c chugim = new ElectiveSet__c(
        Season__c = ids.get('Season'),
        Name = 'Chugim'
      );
      Database.insert(chugim, AccessLevel.USER_MODE);
      Id eventId = SpecialScheduleTestData.colorWar(ids);
      SpecialPlans.Plan before = SpecialPlans.read(eventId);

      Test.startTest();
      String refusal = refusalOf(
        new TypingInAnEvent(chugim.Id, eventId, before.grid.blocks[0].id)
      );
      Test.stopTest();

      Assert.areEqual(
        'Color War\'s columns are stations, not groups, so it can\'t hold elective sets. Put them in special days, where the columns are groups.',
        refusal
      );
      Assert.areEqual(
        before.revision,
        SpecialPlans.read(eventId).revision,
        'Nothing saved'
      );
    }
  }

  // ELECT-4.8, ELECT-5.6
  @IsTest
  static void seatsInASpecialDayAreMovedFinalizedAndSentWithItsOwnTime() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp camp = new Camp();
      ElectiveSeats.RunView view = camp.assignEveryoneInDrama();
      Assert.areEqual(4, view.seats.size());

      Test.startTest();
      view = camp.moveOnTuesday(view.revision, 0, 'Archery');
      view = ElectiveSeatsController.finalizeRun(camp.runId, view.revision);
      Season__c season = [
        SELECT Id, Name
        FROM Season__c
        WHERE Id = :camp.ids.get('Season')
      ];
      List<String> sent = new List<String>();
      for (
        Map<String, Object> row : new OutgoingElectiveSeats()
          .rows(season, 'Week 1')
      ) {
        sent.add(
          row.get('date') +
            ' ' +
            row.get('time_block') +
            ' ' +
            row.get('activity')
        );
      }
      Test.stopTest();

      Assert.areEqual('Final', view.run.status);
      Assignment__c moved = [
        SELECT
          TimeBlock__c,
          SpecialBlock__c,
          TimeName__c,
          ActivityName__c,
          Locked__c
        FROM Assignment__c
        WHERE
          ElectiveRun__c = :camp.runId
          AND Camper__c = :camp.campers[0]
          AND Date__c = :TUESDAY
      ];
      Assert.isNull(moved.TimeBlock__c);
      Assert.areEqual(camp.firstBlock, moved.SpecialBlock__c);
      Assert.areEqual(camp.firstBlockName, moved.TimeName__c);
      Assert.areEqual('Archery', moved.ActivityName__c);
      Assert.isTrue(moved.Locked__c, 'A move by hand is locked');
      // What goes out names the special day's own time.
      sent.sort();
      Assert.areEqual(
        new List<String>{
          '2026-06-29 Period 1 Drama',
          '2026-06-29 Period 1 Drama',
          '2026-06-30 ' +
          camp.firstBlockName +
          ' Archery',
          '2026-06-30 ' +
          camp.firstBlockName +
          ' Drama'
        },
        sent
      );
    }
  }

  // ELECT-5.6
  @IsTest
  static void aFinalRunReadsTheSpecialDayAsItWasAtFinalize() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp camp = new Camp();
      ElectiveSeats.RunView view = camp.assignEveryoneInDrama();

      Test.startTest();
      view = ElectiveSeatsController.finalizeRun(camp.runId, view.revision);
      // The special day edited after Finalize: Chugim taken off Group B.
      SpecialScheduleController.saveCells(
        camp.dayId,
        SpecialScheduleTestData.edits(clearRun(camp, 'Group B'))
      );
      view = ElectiveSeatsController.openRun(camp.runId);
      Test.stopTest();

      Assert.areEqual(
        new List<String>{
          'Monday, Period 1 (2)',
          'Tuesday, ' +
          camp.firstBlockName +
          ' (2)'
        },
        camp.timesOf(view),
        'Shown from the version kept'
      );
      Assert.isTrue(view.scheduleChanged, 'Out of date: said on the screen');
      Assert.areEqual(4, view.seats.size());
    }
  }

  /** Group B's first block emptied, as Delete on the special day's page saves it. */
  private static SlotEdits.Run clearRun(Camp camp, String grp) {
    SlotEdits.Run run = SpecialScheduleTestData.run(
      camp.ids.get(grp),
      new List<String>{ camp.firstBlock },
      new List<String>{ '' }
    );
    run.before = new List<String>{ 'E:' + camp.setId };
    return run;
  }

  // ELECT-6.4
  @IsTest
  static void takingTheSpecialDayOffShowsTheRunChangedAndKeepsItsSeats() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp camp = new Camp();
      ElectiveSeats.RunView view = camp.assignEveryoneInDrama();

      Test.startTest();
      SpecialPlacingController.takeOffDay(camp.onDay('Tuesday'));
      view = ElectiveSeatsController.openRun(camp.runId);

      // The regular day is back with its own Period 1; nothing was taken out of the run.
      Assert.areEqual(
        new List<String>{ 'Monday, Period 1 (2)', 'Tuesday, Period 1 (2)' },
        camp.timesOf(view)
      );
      Assert.isTrue(view.scheduleChanged, 'Said on the screen');
      Assert.areEqual(4, view.seats.size(), 'No seat removed silently');
      Assert.areEqual(
        'Schedule changed since seats were assigned. Assign again first.',
        refusalOf(new Finalizing(camp, view.revision))
      );

      // Put back: its period returns, as it was.
      camp.putOn('Tuesday');
      view = ElectiveSeatsController.openRun(camp.runId);
      Test.stopTest();
      Assert.isFalse(view.scheduleChanged);
      Assert.areEqual(camp.firstBlock, view.times[1].blockId);
    }
  }
}
