/**
 * Finalize and Start a new version (electives slice E7; repo ADR 0018 choices 33 and 34; plan §3
 * "Finalize"; desktop finalizeElectiveRun.js and ADR 2026-09-23-elective-run-lifecycle, a and
 * Q1/Q2, Q5).
 *
 * Finalize, in one transaction: refused, saying why, when there are no seats yet, when where the
 * set sits on the schedule changed since seats were assigned ("Schedule changed. Assign again
 * first."), when a seat no longer fits its offering, or when a place is double-booked at one of
 * the set's times ("Double-booked on the schedule. Fix it, then finalize."). Otherwise it keeps a
 * version of the run's schedule (reason Electives finalized) and points the run at it, copies the
 * activity's, place's and bunk's names onto the seats, and makes the run Final, with when and by
 * whom. A final run never changes again.
 *
 * Start a new version: a Committed copy of a final run, carrying its choices, its locks and its
 * hand moves (Greg, decision 48.6), never its other seats: Assign seats fills the rest.
 */
public with sharing class ElectiveFinalize {
  // Schedule__c.VersionReason__c of the version Finalize keeps.
  public static final String ELECTIVES_FINALIZED = 'ElectivesFinalized';

  /** Finalize, or refused with the reason. */
  public static ElectiveSeats.RunView finalizeRun(Id runId, Decimal revision) {
    ElectiveRunState state = ElectiveRunState.held(runId);
    state.refuseUnlessCurrent(revision);
    refuseUnready(state);
    List<String> clashes = new ElectivePlaceClashes(state).find();
    if (!clashes.isEmpty()) {
      throw new ShoreshException(
        'Double-booked on the schedule (' +
          String.join(clashes, '; ') +
          '). Fix it, then finalize.'
      );
    }
    Savepoint before = Database.setSavepoint();
    try {
      Id versionId = keepSchedule(state);
      Database.update(namedSeats(state), true, AccessLevel.USER_MODE);
      state.bump(
        new ElectiveRun__c(
          Status__c = ElectiveRunState.FINAL_STATUS,
          FinalizedAt__c = System.now(),
          FinalizedBy__c = UserInfo.getUserId(),
          FinalSchedule__c = versionId
        )
      );
    } catch (Exception e) {
      Database.rollback(before);
      throw e;
    }
    return ElectiveSeats.open(runId);
  }

  /**
   * A version of the run's schedule as it is (ManualVersions' automatic version), its reason
   * Electives finalized: what a final run is shown from, and what its downloads read. Named in
   * the camp's word for electives (wiki decision 66): "Chugim finalized: ...".
   */
  private static Id keepSchedule(ElectiveRunState state) {
    String electives = CampLabels.forCamp(state.run.Season__r.Camp__c)
      .plural('Elective');
    Id versionId = ManualVersions.keepAutomatically(
      scheduleOf(state.run),
      (electives + ' finalized: ' + state.run.Name).left(80),
      state.liveDays
    );
    Database.update(
      new Schedule__c(Id = versionId, VersionReason__c = ELECTIVES_FINALIZED),
      AccessLevel.USER_MODE
    );
    return versionId;
  }

  private static void refuseUnready(ElectiveRunState state) {
    if (state.seats.isEmpty()) {
      throw new ShoreshException('Assign seats first.');
    }
    if (state.live.fingerprint() != state.run.TimesFingerprint__c) {
      throw new ShoreshException('Schedule changed. Assign again first.');
    }
    for (Assignment__c seat : state.seats) {
      ElectivePeriod at = state.live.periodOf(
        state.groupOf(seat.Camper__c),
        seat.Date__c,
        seat.TimeBlock__c
      );
      if (at == null || !at.offeringIds.contains(seat.Offering__c)) {
        throw new ShoreshException(
          'A seat no longer fits its offering. Move it, or assign again, then finalize.'
        );
      }
    }
  }

  /** The run's schedule, as ManualVersions keeps a version of it. */
  private static Schedule__c scheduleOf(ElectiveRun__c run) {
    return new Schedule__c(
      Id = run.Schedule__c,
      Program__c = run.Schedule__r.Program__c,
      Week__c = run.Schedule__r.Week__c,
      Origin__c = run.Schedule__r.Origin__c,
      EngineOption__c = run.Schedule__r.EngineOption__c
    );
  }

  /** Each seat with the names it was finalized with, so its downloads never change. */
  private static List<Assignment__c> namedSeats(ElectiveRunState state) {
    List<Assignment__c> result = new List<Assignment__c>();
    for (Assignment__c seat : state.seats) {
      Offering__c offering = state.offeringsById.get(seat.Offering__c);
      Group__c grp = state.groups.get(seat.Group__c);
      result.add(
        new Assignment__c(
          Id = seat.Id,
          ActivityName__c = offering?.Activity__r?.Name?.left(80),
          LocationName__c = offering?.Activity__r?.Location__r?.Name?.left(80),
          GroupName__c = grp?.Name?.left(80)
        )
      );
    }
    return result;
  }

  // ---------------------------------------------------------------- Start a new version

  /** A committed copy of a final run: its choices, locks and hand moves. */
  public static ElectiveSeats.RunView startNewVersion(Id runId) {
    ElectiveRunState state = ElectiveRunState.held(runId);
    if (!state.isFinal()) {
      throw new ShoreshException(
        'Only a final run starts a new version. Reload the page.'
      );
    }
    refuseSecondVersion(state.run);
    Savepoint before = Database.setSavepoint();
    try {
      ElectiveRun__c copy = new ElectiveRun__c(
        Season__c = state.run.Season__c,
        Name = state.run.Name,
        ElectiveSet__c = state.run.ElectiveSet__c,
        Week__c = state.run.Week__c,
        Schedule__c = state.run.Schedule__c,
        Status__c = ElectiveRunState.COMMITTED,
        Revision__c = 1,
        NewVersionOf__c = state.run.Id,
        SourceFile__c = state.run.SourceFile__c,
        SourceFingerprint__c = state.run.SourceFingerprint__c
      );
      Database.insert(copy, true, AccessLevel.USER_MODE);
      Database.insert(choicesFor(copy.Id, state), true, AccessLevel.USER_MODE);
      Database.insert(heldFor(copy.Id, state), true, AccessLevel.USER_MODE);
      return ElectiveSeats.open(copy.Id);
    } catch (Exception e) {
      Database.rollback(before);
      throw e;
    }
  }

  /** One committed run per set, week and schedule: a second is refused, pointing at the first. */
  private static void refuseSecondVersion(ElectiveRun__c run) {
    List<ElectiveRun__c> working = [
      SELECT Id
      FROM ElectiveRun__c
      WHERE
        ElectiveSet__c = :run.ElectiveSet__c
        AND Week__c = :run.Week__c
        AND Schedule__c = :run.Schedule__c
        AND Status__c = :ElectiveRunState.COMMITTED
      WITH USER_MODE
      LIMIT 1
    ];
    if (!working.isEmpty()) {
      throw new ShoreshException(
        'A new version of "' +
          run.Name +
          '" is already being worked on. Choose Committed in the run\'s menu.'
      );
    }
  }

  private static List<Preference__c> choicesFor(
    Id copyId,
    ElectiveRunState state
  ) {
    List<Preference__c> result = new List<Preference__c>();
    for (Preference__c pref : state.preferences) {
      result.add(
        new Preference__c(
          ElectiveRun__c = copyId,
          Camper__c = pref.Camper__c,
          Group__c = pref.Group__c,
          Choices__c = pref.Choices__c,
          ImportedChoices__c = pref.ImportedChoices__c,
          ManualChange__c = pref.ManualChange__c
        )
      );
    }
    return result;
  }

  /** The seats a person set: locked ones and hand moves, as they were. */
  private static List<Assignment__c> heldFor(
    Id copyId,
    ElectiveRunState state
  ) {
    List<Assignment__c> result = new List<Assignment__c>();
    for (Assignment__c seat : state.seats) {
      if (seat.Locked__c != true && seat.ByHand__c != true) {
        continue;
      }
      result.add(
        new Assignment__c(
          ElectiveRun__c = copyId,
          Camper__c = seat.Camper__c,
          Group__c = seat.Group__c,
          Date__c = seat.Date__c,
          TimeBlock__c = seat.TimeBlock__c,
          Offering__c = seat.Offering__c,
          LinkedChoice__c = seat.LinkedChoice__c,
          Locked__c = seat.Locked__c,
          ByHand__c = seat.ByHand__c
        )
      );
    }
    return result;
  }
}
