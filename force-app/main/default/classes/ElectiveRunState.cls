/**
 * One elective run as it is now (electives slice E7; repo ADR 0018 choices 28 to 37): the run, its
 * set's offerings and who can take them, the program's bunks, where the set sits on the run's
 * schedule (ElectiveTimes), the campers' choices and the seats. Read once per request, in user
 * mode, in a fixed number of queries whatever the number of campers: the seats screen's read, and
 * every save's checks, start here.
 *
 * A final run is shown as it was finalized: its elective times come from the version of the
 * schedule saved then (FinalSchedule__c); the run's live schedule is still read, to say whether
 * it has changed since ("Out of date").
 */
public with sharing class ElectiveRunState {
  public static final String COMMITTED = 'Committed';
  public static final String FINAL_STATUS = 'Final';

  public ElectiveRun__c run;
  // The program's bunks, with their division and its order.
  public Map<Id, Group__c> groups = new Map<Id, Group__c>();
  // The set's offerings, by activity name; and by Id.
  public List<Offering__c> offerings = new List<Offering__c>();
  public Map<Id, Offering__c> offeringsById = new Map<Id, Offering__c>();
  public ElectiveOpenness openness;
  // Where the set sits on the run's schedule now, and (for a final run) as it was finalized.
  public List<ScheduleDays.DayGrid> liveDays;
  public ElectiveTimes live;
  public ElectiveTimes shown;
  // The campers' choices, by camper.
  public List<Preference__c> preferences = new List<Preference__c>();
  public Map<Id, Preference__c> byCamper = new Map<Id, Preference__c>();
  public List<Assignment__c> seats = new List<Assignment__c>();

  /** The run as it is now, or refused when it is not there. */
  public ElectiveRunState(Id runId) {
    run = readRun(runId);
    readGroups();
    readOfferings();
    liveDays = ScheduleDays.read(run.Schedule__c);
    live = new ElectiveTimes(liveDays, run.ElectiveSet__c, groups);
    live.offer(offerings, openness);
    shown = live;
    if (isFinal() && run.FinalSchedule__c != null) {
      shown = new ElectiveTimes(
        ScheduleDays.read(run.FinalSchedule__c),
        run.ElectiveSet__c,
        groups
      );
      shown.offer(offerings, openness);
    }
    readChoices();
    readSeats();
  }

  /**
   * The same, for a save: the run is held first, so two saves of one run take turns and the
   * second sees the first's revision.
   */
  public static ElectiveRunState held(Id runId) {
    if (
      [
          SELECT Id
          FROM ElectiveRun__c
          WHERE Id = :runId
          WITH USER_MODE
          FOR UPDATE
        ]
        .isEmpty()
    ) {
      throw notThere();
    }
    return new ElectiveRunState(runId);
  }

  public Boolean isFinal() {
    return run.Status__c == FINAL_STATUS;
  }

  private static ElectiveRun__c readRun(Id runId) {
    List<ElectiveRun__c> found = [
      SELECT
        Id,
        Name,
        Season__c,
        ElectiveSet__c,
        ElectiveSet__r.Name,
        Week__c,
        Week__r.Name,
        Schedule__c,
        Schedule__r.Name,
        Schedule__r.Program__c,
        Schedule__r.Week__c,
        Schedule__r.Origin__c,
        Schedule__r.EngineOption__c,
        Schedule__r.Status__c,
        Status__c,
        Revision__c,
        TimesFingerprint__c,
        EngineVersion__c,
        Dropped__c,
        FinalSchedule__c,
        FinalizedAt__c,
        FinalizedBy__r.Name,
        NewVersionOf__c,
        SourceFile__c,
        SourceFingerprint__c,
        CreatedDate
      FROM ElectiveRun__c
      WHERE Id = :runId
      WITH USER_MODE
    ];
    if (found.isEmpty()) {
      throw notThere();
    }
    return found[0];
  }

  public static ShoreshException notThere() {
    return new ShoreshException(
      'Those elective seats are no longer there. Reload the page.'
    );
  }

  private void readGroups() {
    for (Group__c grp : [
      SELECT
        Id,
        Name,
        SortOrder__c,
        Division__c,
        Division__r.Name,
        Division__r.SortOrder__c
      FROM Group__c
      WHERE Division__r.Program__c = :run.Schedule__r.Program__c
      WITH USER_MODE
      ORDER BY Division__r.SortOrder__c, SortOrder__c, Name, Id
    ]) {
      groups.put(grp.Id, grp);
    }
  }

  private void readOfferings() {
    offerings = [
      SELECT
        Id,
        Activity__c,
        Activity__r.Name,
        Activity__r.Location__c,
        Activity__r.Location__r.Name,
        Seats__c,
        NoSeatLimit__c,
        MinimumToRun__c,
        Proposed__c
      FROM Offering__c
      WHERE ElectiveSet__c = :run.ElectiveSet__c
      WITH USER_MODE
      ORDER BY Activity__r.Name, Id
    ];
    Set<Id> activityIds = new Set<Id>();
    for (Offering__c offering : offerings) {
      offeringsById.put(offering.Id, offering);
      activityIds.add(offering.Activity__c);
    }
    openness = new ElectiveOpenness(
      activityIds.isEmpty()
        ? new List<ActivityEligibility__c>()
        : [
            SELECT Activity__c, Division__c, Group__c
            FROM ActivityEligibility__c
            WHERE Activity__c IN :activityIds
            WITH USER_MODE
          ]
    );
  }

  private void readChoices() {
    preferences = [
      SELECT
        Id,
        Camper__c,
        Camper__r.Name,
        Camper__r.CamperNumber__c,
        Camper__r.ParentComments__c,
        Group__c,
        Choices__c,
        ImportedChoices__c,
        ManualChange__c
      FROM Preference__c
      WHERE ElectiveRun__c = :run.Id
      WITH USER_MODE
      ORDER BY Camper__c
    ];
    for (Preference__c pref : preferences) {
      byCamper.put(pref.Camper__c, pref);
    }
  }

  private void readSeats() {
    seats = [
      SELECT
        Id,
        Camper__c,
        Group__c,
        Date__c,
        TimeBlock__c,
        Offering__c,
        LinkedChoice__c,
        Locked__c,
        ByHand__c
      FROM Assignment__c
      WHERE ElectiveRun__c = :run.Id
      WITH USER_MODE
      ORDER BY Date__c, TimeBlock__c, Camper__c
    ];
  }

  // ---------------------------------------------------------------- shared checks

  /** A save to a final run, or one whose screen saw another revision, is refused. */
  public void refuseUnlessCurrent(Decimal seenRevision) {
    if (isFinal()) {
      throw new ShoreshException(
        '"' +
          run.Name +
          '" is final, so its seats can\'t change. Start a new version first.'
      );
    }
    if (run.Revision__c != seenRevision) {
      throw new ShoreshException(
        'Someone else changed these seats since you opened them. Reload the page to see them.'
      );
    }
  }

  /** The camper's bunk this week (null: the sheet gave none), or refused if not in the run. */
  public Id groupOf(Id camperId) {
    Preference__c pref = byCamper.get(camperId);
    if (pref == null) {
      throw new ShoreshException(
        'That camper is not in this run. Reload the page.'
      );
    }
    return pref.Group__c;
  }

  /** The run moved on: its revision goes up by one, with whatever else the save sets. */
  public void bump(ElectiveRun__c changes) {
    changes.Id = run.Id;
    changes.Revision__c = (run.Revision__c == null ? 0 : run.Revision__c) + 1;
    Database.update(changes, AccessLevel.USER_MODE);
    run.Revision__c = changes.Revision__c;
  }
}
