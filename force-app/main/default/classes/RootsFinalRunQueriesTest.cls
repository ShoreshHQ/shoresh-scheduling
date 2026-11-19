/**
 * Roots' query bound at its worst for the seats card (repo ADR 0020 choice 3; ELECT-4.11): the
 * run it counts is final, so it is read from the version kept at Finalize (FinalSchedule__c), on
 * a week with a special day holding an elective time. The camp is made in @TestSetup (KeptCamp),
 * so the request is measured with nothing read before it in the same transaction, as a real
 * request starts. As a scheduler with the Shoresh Scheduler permission set; made-up names.
 */
@IsTest
private class RootsFinalRunQueriesTest {
  @TestSetup
  static void makeCamp() {
    User scheduler = ShoreshTestData.scheduler();
    Map<String, Id> ids;
    System.runAs(scheduler) {
      // Chugim on Monday and Tuesday's Period 1 for Group A and B; Color War put on Tuesday,
      // Chugim typed into its first block for both; every camper in Drama; then Finalize.
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
      ElectiveSeats.RunView view = ElectiveSeatsController.openRun(camp.runId);
      ElectiveSeatSaves.AssignRequest assign = new ElectiveSeatSaves.AssignRequest();
      assign.runId = camp.runId;
      assign.revision = view.revision;
      for (ElectivePeriod at : view.times) {
        for (Id camperId : camp.campers) {
          ElectiveSeatSaves.SeatIn seat = new ElectiveSeatSaves.SeatIn();
          seat.camperId = camperId;
          seat.day = at.day;
          seat.blockId = at.blockId;
          seat.offeringId = ids.get('o:Drama');
          assign.seats.add(seat);
        }
      }
      view = ElectiveSeatsController.assignSeats(JSON.serialize(assign));
      ElectiveSeatsController.finalizeRun(camp.runId, view.revision);
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
      Assert.isNotNull(
        [
          SELECT FinalSchedule__c
          FROM ElectiveRun__c
          WHERE Id = :ids.get('Run')
          WITH USER_MODE
        ]
        .FinalSchedule__c,
        'The run is final'
      );
      Test.startTest();
      Integer before = Limits.getQueries();
      RootsTable.Table table = RootsController.getTable(ids.get('Season'));
      Integer queries = Limits.getQueries() - before;
      Test.stopTest();

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
