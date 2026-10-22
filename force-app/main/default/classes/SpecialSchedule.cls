/**
 * The schedule inside a special day or special event (ADR 0014 choices 14 to 17), opened for the
 * grid editor: the item, its plan as one day the week editor draws (a special day's groups
 * across, an event's stations across, the plan's own time blocks down), and the season's
 * activities to type in. A plan has no date: its one day is PLAN_DAY, which nothing reads.
 * Runs in user mode; a group or activity deleted since the plan was saved is marked gone.
 */
public with sharing class SpecialSchedule {
  /** The plan's one day, as the week editor keys its cells. Never shown or stored. */
  public static final Date PLAN_DAY = Date.newInstance(2000, 1, 3);

  /** A plan as the screen opens it. */
  public class PlanView {
    @AuraEnabled
    public Id itemId;
    /** 'SpecialDay' or 'SpecialEvent'. */
    @AuraEnabled
    public String kind;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String notes;
    /** The revision the plan was read at; null when nothing is saved yet. */
    @AuraEnabled
    public Integer revision;
    /** Why the plan can't be read (nothing on it is changed), or null. */
    @AuraEnabled
    public String problem;
    /** Whether any cell holds something the director put there (an import is refused then). */
    @AuraEnabled
    public Boolean hasEntries = false;
    /** The plan as one day, shaped as a schedule (ScheduleViews). */
    @AuraEnabled
    public ScheduleViews.ScheduleView schedule;
    /** The season's activities, to type in (only when the plan is opened). */
    @AuraEnabled
    public List<ManualBuildViews.ActivityOption> activities;
  }

  /** The special day or event a plan belongs to. */
  public class Owner {
    public Id itemId;
    public Id seasonId;
    public Id campId;
    public String term;
    public String name;
    public String notes;

    public Owner(Id itemId, String term) {
      this.itemId = itemId;
      this.term = term;
    }

    public Owner named(String name, String notes) {
      this.name = name;
      this.notes = notes;
      return this;
    }

    public Boolean isEvent() {
      return term == 'SpecialEvent';
    }

    public Owner inSeason(Id seasonId, Id campId) {
      this.seasonId = seasonId;
      this.campId = campId;
      return this;
    }
  }

  /** The plan opened: everything the screen needs, with the season's activities. */
  public static PlanView open(Id itemId) {
    Owner owner = ownerOf(itemId);
    SpecialPlans.Plan plan = SpecialPlans.read(itemId);
    List<Group__c> campGroups = owner.isEvent()
      ? new List<Group__c>()
      : SpecialDaySeed.groupsOf(owner.seasonId);
    PlanView view = viewOf(owner, plan, campGroups);
    view.activities = ManualBuildViews.options(owner.seasonId, campGroups);
    return view;
  }

  /** The plan as saved now, without the activities (after a save). */
  public static PlanView reread(Owner owner) {
    return viewOf(owner, SpecialPlans.read(owner.itemId), null);
  }

  /** The item, or refused when it isn't there or can't be seen. */
  public static Owner ownerOf(Id itemId) {
    Schema.SObjectType type = itemId?.getSObjectType();
    Owner owner = null;
    if (type == SpecialDay__c.SObjectType) {
      owner = dayOwner(itemId);
    } else if (type == SpecialEvent__c.SObjectType) {
      owner = eventOwner(itemId);
    }
    if (owner == null) {
      throw notFound();
    }
    return owner;
  }

  /** The same, locked (FOR UPDATE) first, so two saves of its plan run one after the other. */
  public static Owner lockedOwnerOf(Id itemId) {
    Schema.SObjectType type = itemId?.getSObjectType();
    Boolean found = false;
    if (type == SpecialDay__c.SObjectType && canRead(type)) {
      found = ![
          SELECT Id
          FROM SpecialDay__c
          WHERE Id = :itemId
          WITH USER_MODE
          FOR UPDATE
        ]
        .isEmpty();
    } else if (type == SpecialEvent__c.SObjectType && canRead(type)) {
      found = ![
          SELECT Id
          FROM SpecialEvent__c
          WHERE Id = :itemId
          WITH USER_MODE
          FOR UPDATE
        ]
        .isEmpty();
    }
    if (!found) {
      throw notFound();
    }
    return ownerOf(itemId);
  }

  private static Owner dayOwner(Id itemId) {
    if (!canRead(SpecialDay__c.SObjectType)) {
      return null;
    }
    for (SpecialDay__c day : [
      SELECT Name, Notes__c, Season__c, Season__r.Camp__c
      FROM SpecialDay__c
      WHERE Id = :itemId
      WITH USER_MODE
    ]) {
      return new Owner(itemId, 'SpecialDay')
        .named(day.Name, day.Notes__c)
        .inSeason(day.Season__c, day.Season__r.Camp__c);
    }
    return null;
  }

  private static Owner eventOwner(Id itemId) {
    if (!canRead(SpecialEvent__c.SObjectType)) {
      return null;
    }
    for (SpecialEvent__c event : [
      SELECT Name, Notes__c, Season__c, Season__r.Camp__c
      FROM SpecialEvent__c
      WHERE Id = :itemId
      WITH USER_MODE
    ]) {
      return new Owner(itemId, 'SpecialEvent')
        .named(event.Name, event.Notes__c)
        .inSeason(event.Season__c, event.Season__r.Camp__c);
    }
    return null;
  }

  /** Without access to the object, it is "not found", never a platform error. */
  private static Boolean canRead(Schema.SObjectType type) {
    return type.getDescribe(SObjectDescribeOptions.DEFERRED).isAccessible();
  }

  private static ShoreshException notFound() {
    return new ShoreshException(
      'That was not found, or you don\'t have access to it. Reload the page.'
    );
  }

  /**
   * The grid a plan starts from when nothing is saved yet: a special day's rows are every group
   * in the camp, an event has none; neither has time blocks.
   */
  public static ScheduleGrid emptyGrid(Owner owner, List<Group__c> campGroups) {
    ScheduleGrid grid = new ScheduleGrid();
    if (owner.isEvent()) {
      return grid;
    }
    List<Group__c> groupList = campGroups == null
      ? SpecialDaySeed.groupsOf(owner.seasonId)
      : campGroups;
    for (Group__c grp : groupList) {
      grid.groups.add(new ScheduleGrid.GroupRef(grp.Id, grp.Name));
      grid.rows.add(new List<String>());
    }
    return grid;
  }

  private static PlanView viewOf(
    Owner owner,
    SpecialPlans.Plan plan,
    List<Group__c> campGroups
  ) {
    PlanView view = new PlanView();
    view.itemId = owner.itemId;
    view.kind = owner.term;
    view.name = owner.name;
    view.notes = owner.notes;
    view.revision = plan.revision;
    view.problem = plan.problem;
    view.schedule = new ScheduleViews.ScheduleView();
    view.schedule.schedule = new ScheduleViews.VersionRow();
    view.schedule.schedule.id = owner.itemId;
    view.schedule.schedule.name = owner.name;
    ScheduleGrid grid = plan.problem != null
      ? null
      : (plan.grid == null ? emptyGrid(owner, campGroups) : plan.grid);
    view.hasEntries = SpecialPlanEntries.hasEntries(grid);
    view.schedule.days.add(SpecialPlanDay.of(grid, plan.problem, owner));
    return view;
  }
}
