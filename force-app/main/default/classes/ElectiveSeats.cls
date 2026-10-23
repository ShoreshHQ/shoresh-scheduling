/**
 * The Elective seats screen's reads (electives slice E7; repo ADR 0018 choices 28 to 37): the
 * season's runs, for the rail's choices, and one run as the screen shows it. What the screen gets
 * is what the director may read already (every query in user mode, through ElectiveRunState); a
 * camper's name goes to the browser only here, and never into a message.
 */
public with sharing class ElectiveSeats {
  /** The season's elective runs, oldest first. */
  public class Situation {
    @AuraEnabled
    public List<RunInfo> runs = new List<RunInfo>();
  }

  public class RunInfo {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Id setId;
    @AuraEnabled
    public Id weekId;
    @AuraEnabled
    public Id scheduleId;
    @AuraEnabled
    public String status;
    @AuraEnabled
    public Datetime createdAt;
    @AuraEnabled
    public Datetime finalizedAt;
    @AuraEnabled
    public String finalizedBy;
    @AuraEnabled
    public Id newVersionOf;
  }

  /** One run as the seats screen shows it. */
  public class RunView {
    @AuraEnabled
    public RunInfo run;
    @AuraEnabled
    public Decimal revision;
    @AuraEnabled
    public String setName;
    @AuraEnabled
    public String sourceFile;
    // Seats were assigned (the run has a fingerprint of where the set sat then).
    @AuraEnabled
    public Boolean assigned = false;
    // Where the set sits on the run's schedule is not where it sat when seats were assigned.
    @AuraEnabled
    public Boolean scheduleChanged = false;
    @AuraEnabled
    public List<ElectivePeriod> times = new List<ElectivePeriod>();
    @AuraEnabled
    public List<OfferingInfo> offerings = new List<OfferingInfo>();
    @AuraEnabled
    public List<GroupInfo> groups = new List<GroupInfo>();
    @AuraEnabled
    public List<CamperInfo> campers = new List<CamperInfo>();
    @AuraEnabled
    public List<SeatInfo> seats = new List<SeatInfo>();
    // What did not run when seats were last assigned (ElectiveRun__c.Dropped__c), as saved.
    @AuraEnabled
    public String dropped;
    // Days of the schedule that could not be read, and why.
    @AuraEnabled
    public List<String> unreadable = new List<String>();
  }

  public class OfferingInfo {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public Id activityId;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Decimal seats;
    @AuraEnabled
    public Boolean noLimit = false;
    @AuraEnabled
    public Decimal minimum;
    @AuraEnabled
    public Boolean proposed = false;
  }

  public class GroupInfo {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Id divisionId;
    @AuraEnabled
    public String divisionName;
  }

  public class CamperInfo {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String camperNumber;
    @AuraEnabled
    public String comment;
    @AuraEnabled
    public Id groupId;
    @AuraEnabled
    public String choices;
    @AuraEnabled
    public Boolean manualChange = false;
  }

  public class SeatInfo {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public Id camperId;
    @AuraEnabled
    public Date day;
    @AuraEnabled
    public Id blockId;
    @AuraEnabled
    public Id offeringId;
    @AuraEnabled
    public Boolean locked = false;
    @AuraEnabled
    public Boolean byHand = false;
  }

  // ---------------------------------------------------------------- reads

  /** The season's runs: what the rail chooses from. One query. */
  public static Situation situation(Id seasonId) {
    Situation result = new Situation();
    for (ElectiveRun__c run : [
      SELECT
        Id,
        Name,
        ElectiveSet__c,
        Week__c,
        Schedule__c,
        Status__c,
        CreatedDate,
        FinalizedAt__c,
        FinalizedBy__r.Name,
        NewVersionOf__c
      FROM ElectiveRun__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY CreatedDate, Id
    ]) {
      result.runs.add(info(run));
    }
    return result;
  }

  public static RunInfo info(ElectiveRun__c run) {
    RunInfo result = new RunInfo();
    result.id = run.Id;
    result.name = run.Name;
    result.setId = run.ElectiveSet__c;
    result.weekId = run.Week__c;
    result.scheduleId = run.Schedule__c;
    result.status = run.Status__c;
    result.createdAt = run.CreatedDate;
    result.finalizedAt = run.FinalizedAt__c;
    result.finalizedBy = run.FinalizedBy__r?.Name;
    result.newVersionOf = run.NewVersionOf__c;
    return result;
  }

  /** One run as the screen shows it. */
  public static RunView open(Id runId) {
    return viewOf(new ElectiveRunState(runId));
  }

  public static RunView viewOf(ElectiveRunState state) {
    RunView view = new RunView();
    ElectiveRun__c run = state.run;
    view.run = info(run);
    view.revision = run.Revision__c;
    view.setName = run.ElectiveSet__r.Name;
    view.sourceFile = run.SourceFile__c;
    view.assigned = String.isNotBlank(run.TimesFingerprint__c);
    view.scheduleChanged =
      view.assigned && state.live.fingerprint() != run.TimesFingerprint__c;
    view.times = state.shown.periods;
    view.unreadable = state.live.unreadable;
    view.dropped = run.Dropped__c;
    for (Offering__c offering : state.offerings) {
      view.offerings.add(offeringInfo(offering));
    }
    for (Group__c grp : state.groups.values()) {
      view.groups.add(groupInfo(grp));
    }
    for (Preference__c pref : state.preferences) {
      view.campers.add(camperInfo(pref));
    }
    for (Assignment__c seat : state.seats) {
      view.seats.add(seatInfo(seat));
    }
    return view;
  }

  private static OfferingInfo offeringInfo(Offering__c offering) {
    OfferingInfo made = new OfferingInfo();
    made.id = offering.Id;
    made.activityId = offering.Activity__c;
    made.name = offering.Activity__r.Name;
    made.seats = offering.Seats__c;
    made.noLimit = offering.NoSeatLimit__c == true;
    made.minimum = offering.MinimumToRun__c;
    made.proposed = offering.Proposed__c == true;
    return made;
  }

  private static GroupInfo groupInfo(Group__c grp) {
    GroupInfo made = new GroupInfo();
    made.id = grp.Id;
    made.name = grp.Name;
    made.divisionId = grp.Division__c;
    made.divisionName = grp.Division__r?.Name;
    return made;
  }

  private static CamperInfo camperInfo(Preference__c pref) {
    CamperInfo made = new CamperInfo();
    made.id = pref.Camper__c;
    made.name = pref.Camper__r.Name;
    made.camperNumber = pref.Camper__r.CamperNumber__c;
    made.comment = pref.Camper__r.ParentComments__c;
    made.groupId = pref.Group__c;
    made.choices = pref.Choices__c;
    made.manualChange = pref.ManualChange__c == true;
    return made;
  }

  private static SeatInfo seatInfo(Assignment__c seat) {
    SeatInfo made = new SeatInfo();
    made.id = seat.Id;
    made.camperId = seat.Camper__c;
    made.day = seat.Date__c;
    made.blockId = seat.TimeBlock__c;
    made.offeringId = seat.Offering__c;
    made.locked = seat.Locked__c == true;
    made.byHand = seat.ByHand__c == true;
    return made;
  }
}
