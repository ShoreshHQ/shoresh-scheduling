/**
 * Roots' query bound at its worst for the seats card (repo ADR 0020 choice 3; ELECT-4.11): the
 * run it counts is final, so it is read from the version kept at Finalize (FinalSchedule__c), on
 * a week with a special day holding an elective time. The camp is made in @TestSetup (KeptCamp);
 * the seats are assigned in the test and Finalize runs in its own limits, before the request is
 * measured. As a scheduler with the Shoresh Scheduler permission set; made-up names.
 */
@IsTest
private class RootsFinalRunQueriesTest {
  @TestSetup
  static void makeCamp() {
    User scheduler = ShoreshTestData.scheduler();
    Map<String, Id> ids;
    System.runAs(scheduler) {
      // Chugim on Monday and Tuesday's Period 1 for Group A and B; Color War put on Tuesday,
      // Chugim typed into its first block for both.
      ElectiveSeatsCamp camp = new ElectiveSeatsCamp(6);
      ids = camp.ids;
      Id dayId = SpecialScheduleTestData.addDay(ids.get('Season'), 'Color War');
      SpecialDayPlacing.Request request = new SpecialDayPlacing.Request();
      request.specialDayId = dayId;
      request.weekId = ids.get('Week 1');
      request.day = 'Tuesday';
      SpecialPlacingController.putOnDay(request);
      String firstBlock = SpecialPlans.read(dayId).grid.blocks[0].id;
      SlotEdits.Edit edit = new SlotEdits.Edit();
      edit.runs = new List<SlotEdits.Run>();
      for (String grp : new List<String>{ 'Group A', 'Group B' }) {
        edit.runs.add(
          SpecialScheduleTestData.run(
            ids.get(grp),
            new List<String>{ firstBlock },
            new List<String>{ 'E:' + camp.setId }
          )
        );
      }
      SpecialScheduleController.saveCells(
        dayId,
        new List<SlotEdits.Edit>{ edit }
      );
      ids.put('Run', camp.runId);
    }
    ids.put('Scheduler', scheduler.Id);
    KeptCamp.keepIds(ids);
  }

  // ELECT-4.11
  @IsTest
  static void aFinalRunOnAWeekWithASpecialDayStaysWithinTheBound() {
    Map<String, Id> ids = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(ids)) {
      // Every camper in Drama at every time; then Finalize, in its own limits.
      ElectiveSeats.RunView view = ElectiveSeatsController.openRun(
        ids.get('Run')
      );
      ElectiveSeatSaves.AssignRequest assign = new ElectiveSeatSaves.AssignRequest();
      assign.runId = ids.get('Run');
      assign.revision = view.revision;
      for (ElectivePeriod at : view.times) {
        for (ElectiveSeats.CamperInfo camper : view.campers) {
          ElectiveSeatSaves.SeatIn seat = new ElectiveSeatSaves.SeatIn();
          seat.camperId = camper.id;
          seat.day = at.day;
          seat.blockId = at.blockId;
          seat.offeringId = ids.get('o:Drama');
          assign.seats.add(seat);
        }
      }
      view = ElectiveSeatsController.assignSeats(JSON.serialize(assign));
      Test.startTest();
      view = ElectiveSeatsController.finalizeRun(ids.get('Run'), view.revision);
      Test.stopTest();
      Assert.areEqual('Final', view.run.status);
      // What Finalize read stays read in this transaction: the week's special days are read
      // again (forget), but the special days the kept version carries are not (SpecialsCarried
      // reads each schedule's once per request), so a request of its own reads one more.
      ElectiveDays.forget();
      Integer before = Limits.getQueries();
      RootsTable.Table table = RootsController.getTable(ids.get('Season'));
      Integer queries = Limits.getQueries() - before + 1;

      Assert.isTrue(queries <= 20, 'Roots read with ' + queries + ' queries');
      Assert.areEqual(ids.get('Run'), table.seatsRunId);
      RootsTable.Seat drama;
      for (RootsTable.Seat seat : table.seats) {
        if (seat.name == 'Drama') {
          drama = seat;
        }
      }
      // Everyone in Drama at each time, the special day's included: 6 at the most.
      Assert.areEqual(6, drama.taken, JSON.serialize(table));
    }
  }
}
