/**
 * A large camp's elective seats (repo ADR 0018 choice 59): a save past the 10,000 rows one
 * Salesforce request may write (Assign, Assign again, Finalize, end-of-season Clear) is checked in
 * the request as any save is, then written in the background a part at a time (ElectiveBigSave),
 * the run carrying how far it got; every other save of the run waits; a part that fails, or dies
 * without a word, stops it with why, shown to the person. The first test is full size: 600 campers
 * at 20 times, 12,000 seats in one week. The rest make the parts small so a test can hold them.
 * Every test acts as a scheduler and makes its records inside the same runAs. Names are made up.
 */
@IsTest
private class ElectiveLargeCampTest {
  /** Runs a save the test held, part by part, then its end (a test can run one batch part only). */
  private static void runHeldSave() {
    ElectiveBigSave save = ElectiveBigSave.held;
    ElectiveBigSave.held = null;
    for (Object i : (List<Object>) save.start(null)) {
      save.execute(null, new List<Object>{ i });
    }
    save.finish(null);
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

  private class Moving implements Callable {
    ElectiveSeatsCamp camp;
    Decimal revision;
    Moving(ElectiveSeatsCamp camp, Decimal revision) {
      this.camp = camp;
      this.revision = revision;
    }
    public Object call(String action, Map<String, Object> args) {
      return camp.move(revision, 0, 'Pottery');
    }
  }

  private static ElectiveRun__c runOf(Id runId) {
    return [
      SELECT
        Revision__c,
        Status__c,
        TimesFingerprint__c,
        FinalSchedule__c,
        SaveDone__c,
        SaveTotal__c,
        SaveProblem__c,
        SaveJob__c,
        SeatCount__c
      FROM ElectiveRun__c
      WHERE Id = :runId
    ];
  }

  private static Integer seatsOf(Id runId) {
    return [SELECT COUNT() FROM Assignment__c WHERE ElectiveRun__c = :runId];
  }

  // ---------------------------------------------------------------- full size

  // ELECT-5.8: a full-size week is written in parts, its progress shown, other saves refused meanwhile.
  @IsTest
  static void aWeekOfTwelveThousandSeatsIsAssignedInParts() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveSeatsCamp camp = new ElectiveSeatsCamp(600).wholeWeek();
      String sent = JSON.serialize(camp.everyoneInDramaAllWeek(1));
      ElectiveBigSave.holdInTest = true;

      Test.startTest();
      ElectiveSeats.RunView view = ElectiveSeatsController.assignSeats(sent);
      Assert.areEqual(0, view.saveDone.intValue(), 'Checked, then saving');
      Assert.areEqual(12000, view.saveTotal.intValue());
      // The first part, as Salesforce runs it, with a request's own limits.
      ElectiveBigSave save = ElectiveBigSave.held;
      save.execute(null, new List<Object>{ 0 });
      Test.stopTest();

      ElectiveRun__c run = runOf(camp.runId);
      Assert.areEqual(9000, run.SaveDone__c.intValue());
      Assert.areEqual(9000, seatsOf(camp.runId));
      Assert.isNull(
        run.TimesFingerprint__c,
        'Not assigned until every seat is'
      );
      String refusal = refusalOf(new Moving(camp, run.Revision__c));
      Assert.areEqual(
        'Seats are still being saved (9,000 of 12,000). Try again when that\'s done.',
        refusal
      );

      save.execute(null, new List<Object>{ 1 });
      save.finish(null);
      run = runOf(camp.runId);
      Assert.areEqual(12000, seatsOf(camp.runId));
      Assert.areEqual(12000, run.SeatCount__c.intValue());
      Assert.areEqual(2, run.Revision__c.intValue());
      Assert.areEqual(64, run.TimesFingerprint__c.length());
      Assert.isNull(run.SaveTotal__c, 'The save is over');
      Assert.isNull(run.SaveDone__c);
    }
  }

  // ---------------------------------------------------------------- in small parts

  // ELECT-5.8, ELECT-5.10: Assign again in parts writes the same seats, and empties what goes.
  @IsTest
  static void assignAgainInPartsWritesTheSameSeatsAndEmptiesWhatGoes() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveSeatsCamp camp = new ElectiveSeatsCamp(4);
      ElectiveSeats.RunView view = camp.assign(camp.everyoneInDrama(1));
      Assert.areEqual(8, view.seats.size());
      // Assign again with half the campers' Monday seats gone (the engine placed them nowhere)
      // and two moved: past a bound of 5 rows, in parts of 3.
      ElectiveSeatSaves.AssignRequest again = camp.everyoneInDrama(
        view.revision
      );
      again.seats[2].offeringId = camp.ids.get('o:Pottery');
      again.seats[4].offeringId = camp.ids.get('o:Pottery');
      again.seats.remove(6);
      again.seats.remove(0);
      ElectiveSeatSaves.rowBound = 5;
      ElectiveBigSave.part = 6;
      ElectiveBigSave.holdInTest = true;

      Test.startTest();
      view = camp.assign(again);
      Assert.areEqual(4, view.saveTotal.intValue(), 'Two deletes, two changes');
      Assert.areEqual(8, view.seats.size(), 'Nothing written yet');
      runHeldSave();
      Test.stopTest();

      Assert.areEqual(6, seatsOf(camp.runId));
      Assert.areEqual(
        camp.ids.get('o:Pottery'),
        camp.mondaySeat(1).Offering__c
      );
      ElectiveRun__c run = runOf(camp.runId);
      Assert.areEqual(view.revision + 1, run.Revision__c);
      Assert.isNull(run.SaveTotal__c);
      // Emptied from the Recycle Bin can't be seen in a test (emptied rows still read as
      // deleted); that the rows were deleted for good is checked in the test org.
    }
  }

  // ELECT-5.9: a part that fails stops the save, keeping how far it got and why.
  @IsTest
  static void aPartThatFailsStopsTheSaveWithWhy() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveSeatsCamp camp = new ElectiveSeatsCamp(4);
      ElectiveSeatSaves.rowBound = 5;
      ElectiveBigSave.part = 3;
      ElectiveBigSave.holdInTest = true;
      camp.assign(camp.everyoneInDrama(1));
      ElectiveBigSave save = ElectiveBigSave.held;

      Test.startTest();
      save.execute(null, new List<Object>{ 0 });
      // The last camper's seats (the third part) can't be written: the camper was removed.
      Database.delete(
        [SELECT Id FROM Preference__c WHERE Camper__c = :camp.campers[3]],
        AccessLevel.USER_MODE
      );
      Database.delete(
        new Camper__c(Id = camp.campers[3]),
        AccessLevel.USER_MODE
      );
      save.execute(null, new List<Object>{ 1 });
      save.execute(null, new List<Object>{ 2 });
      save.finish(null);
      Test.stopTest();

      ElectiveRun__c run = runOf(camp.runId);
      Assert.areEqual(6, run.SaveDone__c.intValue(), 'How far it got');
      Assert.areEqual(8, run.SaveTotal__c.intValue());
      Assert.areEqual('That was removed. Reload the page.', run.SaveProblem__c);
      Assert.areEqual(
        6,
        seatsOf(camp.runId),
        'Nothing from the part that failed'
      );
      Assert.isNull(run.TimesFingerprint__c, 'Never shown as assigned');
      Assert.areEqual(
        2,
        run.Revision__c.intValue(),
        'A screen opened before is stale'
      );
      ElectiveSeats.RunView view = ElectiveSeatsController.openRun(camp.runId);
      Assert.areEqual(run.SaveProblem__c, view.saveProblem);
      Assert.isNull(
        ElectiveSeatsController.clearPicture(camp.ids.get('Season')).saveTotal,
        'An Assign is never taken for a Clear'
      );
      // Assign again goes ahead, and puts the stop behind it.
      ElectiveSeatSaves.rowBound = 9500;
      ElectiveSeatSaves.AssignRequest again = camp.everyoneInDrama(
        view.revision
      );
      again.seats.remove(7);
      again.seats.remove(6);
      view = camp.assign(again);
      Assert.areEqual(6, view.seats.size());
      Assert.isNull(view.saveProblem);
      Assert.isNull(view.saveTotal);
    }
  }

  @IsTest
  static void aPartThatDiedWithoutAWordStopsTheSaveAtTheEnd() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveSeatsCamp camp = new ElectiveSeatsCamp(4);
      ElectiveSeatSaves.rowBound = 5;
      ElectiveBigSave.part = 3;
      ElectiveBigSave.holdInTest = true;
      camp.assign(camp.everyoneInDrama(1));
      ElectiveBigSave save = ElectiveBigSave.held;

      Test.startTest();
      save.execute(null, new List<Object>{ 0 });
      // The second part ran out of time: Salesforce undid it whole, its rows and its count.
      save.execute(null, new List<Object>{ 2 });
      save.finish(null);
      Test.stopTest();

      ElectiveRun__c run = runOf(camp.runId);
      Assert.areEqual(
        'A part of it couldn\'t be saved, so the rest wasn\'t.',
        run.SaveProblem__c
      );
      Assert.areEqual(6, run.SaveDone__c.intValue());
      Assert.areEqual(6, seatsOf(camp.runId));
      Assert.isNull(run.TimesFingerprint__c, 'Never shown as assigned');
    }
  }

  @IsTest
  static void aCountThatIsNotThisSavesStopsIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveSeatsCamp camp = new ElectiveSeatsCamp(4);
      ElectiveSeatSaves.rowBound = 5;
      ElectiveBigSave.part = 3;
      ElectiveBigSave.holdInTest = true;
      camp.assign(camp.everyoneInDrama(1));
      ElectiveBigSave save = ElectiveBigSave.held;

      Test.startTest();
      save.execute(null, new List<Object>{ 0 });
      // Another save took over the run meanwhile: this one writes nothing more.
      Database.update(
        new ElectiveRun__c(Id = camp.runId, SaveDone__c = 2),
        AccessLevel.USER_MODE
      );
      save.execute(null, new List<Object>{ 1 });
      save.finish(null);
      Test.stopTest();

      Assert.areEqual(3, seatsOf(camp.runId));
      Assert.isNotNull(runOf(camp.runId).SaveProblem__c);
    }
  }

  @IsTest
  static void finalizeInPartsIsFinalOnceEverySeatHasItsNames() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveSeatsCamp camp = new ElectiveSeatsCamp(6);
      ElectiveSeats.RunView view = camp.assign(camp.everyoneInDrama(1));
      ElectiveSeatSaves.rowBound = 5;
      ElectiveBigSave.part = 5;
      ElectiveBigSave.holdInTest = true;

      Test.startTest();
      view = ElectiveSeatsController.finalizeRun(camp.runId, view.revision);
      Assert.areEqual('Committed', view.run.status, 'Not final yet');
      Assert.areEqual(12, view.saveTotal.intValue());
      runHeldSave();
      Test.stopTest();

      ElectiveRun__c run = runOf(camp.runId);
      Assert.areEqual('Final', run.Status__c);
      Assert.isNotNull(run.FinalSchedule__c);
      Assert.isNull(run.SaveTotal__c);
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Assignment__c
          WHERE ElectiveRun__c = :camp.runId AND ActivityName__c != 'Drama'
        ],
        'Every seat has its names'
      );
    }
  }

  @IsTest
  static void finalizeStoppedTakesItsVersionAwayAgain() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveSeatsCamp camp = new ElectiveSeatsCamp(6);
      ElectiveSeats.RunView view = camp.assign(camp.everyoneInDrama(1));
      ElectiveSeatSaves.rowBound = 5;
      ElectiveBigSave.part = 5;
      ElectiveBigSave.holdInTest = true;
      Integer versions = [
        SELECT COUNT()
        FROM Schedule__c
        WHERE VersionReason__c = :ElectiveFinalize.ELECTIVES_FINALIZED
      ];

      Test.startTest();
      ElectiveSeatsController.finalizeRun(camp.runId, view.revision);
      ElectiveBigSave save = ElectiveBigSave.held;
      // Its later parts were lost: the end comes up short and stops it.
      save.execute(null, new List<Object>{ 0 });
      save.finish(null);
      Test.stopTest();

      ElectiveRun__c run = runOf(camp.runId);
      Assert.areEqual('Committed', run.Status__c);
      Assert.isNotNull(run.SaveProblem__c);
      Assert.areEqual(
        versions,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE VersionReason__c = :ElectiveFinalize.ELECTIVES_FINALIZED
        ],
        'No "finalized" version stands for a run that isn\'t'
      );
    }
  }

  @IsTest
  static void clearInPartsTakesTheSeatsThenTheRunAndCampers() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveSeatsCamp camp = new ElectiveSeatsCamp(6);
      ElectiveSeats.RunView view = camp.assign(camp.everyoneInDrama(1));
      view = ElectiveSeatsController.finalizeRun(camp.runId, view.revision);
      Id seasonId = camp.ids.get('Season');
      ElectiveClear.Picture picture = ElectiveSeatsController.clearPicture(
        seasonId
      );
      Assert.areEqual(12, picture.weeks[0].seats, 'Counted by the run');
      ElectiveSeatSaves.rowBound = 5;
      ElectiveBigSave.part = 10;
      ElectiveBigSave.holdInTest = true;
      ElectiveClear.ClearRequest request = new ElectiveClear.ClearRequest();
      request.seasonId = seasonId;
      request.stamp = picture.stamp;

      Test.startTest();
      ElectiveClear.Result result = ElectiveSeatsController.clearElectives(
        JSON.serialize(request)
      );
      Assert.areEqual(0, result.picture.saveDone.intValue());
      Assert.areEqual(
        18,
        result.picture.saveTotal.intValue(),
        '12 seats, 6 choices'
      );
      ElectiveBigSave save = ElectiveBigSave.held;
      save.execute(null, new List<Object>{ 0 });
      picture = ElectiveSeatsController.clearPicture(seasonId);
      Assert.areEqual(5, picture.saveDone.intValue(), 'Five gone: ten rows');
      try {
        request.stamp = picture.stamp;
        ElectiveSeatsController.clearElectives(JSON.serialize(request));
        Assert.fail('A second Clear waits');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          'Clearing is still going (5 of 18). Look again when it\'s done.',
          e.getMessage()
        );
      }
      for (Integer i = 1; i < 4; i++) {
        save.execute(null, new List<Object>{ i });
      }
      save.finish(null);
      Test.stopTest();

      Assert.areEqual(
        0,
        [SELECT COUNT() FROM ElectiveRun__c WHERE Id = :camp.runId]
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Camper__c WHERE Id IN :camp.campers]
      );
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM ElectiveSet__c WHERE Id = :camp.setId],
        'The set stays'
      );
    }
  }

  // ELECT-5.9: a job Salesforce ended is shown stopped, never saving for ever.
  @IsTest
  static void aSaveSalesforceStoppedWithoutAWordIsShownStoppedNotSavingForEver() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveSeatsCamp camp = new ElectiveSeatsCamp(4);
      ElectiveSeatSaves.rowBound = 5;
      ElectiveBigSave.part = 3;

      Test.startTest();
      ElectiveSeats.RunView view = camp.assign(camp.everyoneInDrama(1));
      Id jobId = runOf(camp.runId).SaveJob__c;
      Assert.isNotNull(jobId, 'The background job is kept with the run');
      // Cancelled in Setup before any part ran.
      System.abortJob(jobId);
      Test.stopTest();

      view = ElectiveSeatsController.openRun(camp.runId);
      Assert.areEqual(
        'Salesforce stopped it before the end.',
        view.saveProblem
      );
      // Not "still being saved": the next save goes ahead and puts the stop behind it.
      ElectiveSeatSaves.rowBound = 9500;
      view = camp.assign(camp.everyoneInDrama(view.revision));
      Assert.areEqual(8, view.seats.size());
      Assert.isNull(view.saveTotal);
    }
  }
}
