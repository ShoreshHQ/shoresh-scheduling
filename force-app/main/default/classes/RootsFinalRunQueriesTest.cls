/**
 * Roots' query bound at its worst for the seats card (repo ADR 0020 choice 3; ELECT-4.11): the
 * run it counts is final, so its times are read from the version kept at Finalize
 * (FinalSchedule__c) and what that version carries, and its live times from a week with a special
 * day put on it. The camp is made in @TestSetup (KeptCamp), so the request is measured with
 * nothing read before it, as a real request starts. The run is made final directly, as Finalize
 * leaves it (Finalize itself is ElectiveSeatsTest's and SpecialDayElectivesTest's). As a
 * scheduler with the Shoresh Scheduler permission set; made-up names.
 */
@IsTest
private class RootsFinalRunQueriesTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);

  @TestSetup
  static void makeCamp() {
    User scheduler = ShoreshTestData.scheduler();
    Map<String, Id> ids;
    System.runAs(scheduler) {
      // Chugim on Monday and Tuesday's Period 1 for Group A and B (one division), six campers;
      // Color War put on Tuesday.
      ElectiveSeatsCamp camp = new ElectiveSeatsCamp(6);
      ids = camp.ids;
      SpecialDayPlacing.Request request = new SpecialDayPlacing.Request();
      request.specialDayId = SpecialScheduleTestData.addDay(
        ids.get('Season'),
        'Color War'
      );
      request.weekId = ids.get('Week 1');
      request.day = 'Tuesday';
      SpecialPlacingController.putOnDay(request);
      // The version Finalize keeps: the week as it was, Chugim on both days.
      Schedule__c kept = new Schedule__c(
        Program__c = ids.get('Main'),
        Week__c = ids.get('Week 1'),
        Name = 'Chugim finalized',
        Status__c = 'Version',
        Origin__c = 'Manual',
        VersionReason__c = ElectiveFinalize.ELECTIVES_FINALIZED
      );
      Database.insert(kept, AccessLevel.USER_MODE);
      List<ScheduleDaySaves.DaySave> days = new List<ScheduleDaySaves.DaySave>();
      for (Integer d = 0; d < 2; d++) {
        days.add(
          new ScheduleDaySaves.DaySave(
            MONDAY.addDays(d),
            camp.grid(new List<String>{ '1,', '1,' }),
            null
          )
        );
      }
      ScheduleDaySaves.writeAsItWas(kept.Id, days);
      // Every camper in Drama on Monday; the run final on the kept version.
      List<Assignment__c> seats = new List<Assignment__c>();
      for (Id camperId : camp.campers) {
        seats.add(
          new Assignment__c(
            ElectiveRun__c = camp.runId,
            Camper__c = camperId,
            Date__c = MONDAY,
            TimeBlock__c = ids.get('Period 1'),
            Offering__c = ids.get('o:Drama')
          )
        );
      }
      Database.insert(seats, AccessLevel.USER_MODE);
      Database.update(
        new ElectiveRun__c(
          Id = camp.runId,
          Status__c = ElectiveRunState.FINAL_STATUS,
          FinalSchedule__c = kept.Id
        ),
        AccessLevel.USER_MODE
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
      // Counted at the kept version's Monday time: all six.
      Assert.areEqual(6, drama.taken, JSON.serialize(table));
    }
  }
}
