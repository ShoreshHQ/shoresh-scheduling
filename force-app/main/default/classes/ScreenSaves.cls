/**
 * Saving from the setup screens: only the kinds of record these screens edit, in user mode, all
 * or none, with "Runs in" week ticks (and, for recurring activities, who each covers) saved
 * together with their rows. Clashes between fixed and recurring activities are checked once
 * everything is written, and refuse the whole save.
 */
public with sharing class ScreenSaves {
  // The only records these screens may save, and the fields each screen sends (Id aside).
  private static final Map<Schema.SObjectType, Set<Schema.SObjectField>> SAVABLE_FIELDS = new Map<Schema.SObjectType, Set<Schema.SObjectField>>{
    Camp__c.SObjectType => new Set<Schema.SObjectField>{ Camp__c.Name },
    Season__c.SObjectType => new Set<Schema.SObjectField>{
      Season__c.Name,
      Season__c.StartDate__c,
      Season__c.EndDate__c,
      Season__c.Status__c,
      Season__c.ShrinkShortWeek__c
    },
    Week__c.SObjectType => new Set<Schema.SObjectField>{
      Week__c.Name,
      Week__c.StartDate__c,
      Week__c.EndDate__c,
      Week__c.SortOrder__c
    },
    Program__c.SObjectType => new Set<Schema.SObjectField>{
      Program__c.Name,
      Program__c.SortOrder__c,
      Program__c.Monday__c,
      Program__c.Tuesday__c,
      Program__c.Wednesday__c,
      Program__c.Thursday__c,
      Program__c.Friday__c,
      Program__c.Saturday__c,
      Program__c.Sunday__c
    },
    Division__c.SObjectType => new Set<Schema.SObjectField>{
      Division__c.Name,
      Division__c.SortOrder__c
    },
    // A group may also move to another division of its own program (GroupMoves refuses others).
    Group__c.SObjectType => new Set<Schema.SObjectField>{
      Group__c.Name,
      Group__c.SortOrder__c,
      Group__c.Availability__c,
      Group__c.Division__c
    },
    TimeBlock__c.SObjectType => new Set<Schema.SObjectField>{
      TimeBlock__c.Name,
      TimeBlock__c.SortOrder__c,
      TimeBlock__c.StartTime__c,
      TimeBlock__c.EndTime__c,
      TimeBlock__c.PartOfDay__c
    },
    LocationType__c.SObjectType => new Set<Schema.SObjectField>{
      LocationType__c.Name,
      LocationType__c.SortOrder__c
    },
    Location__c.SObjectType => new Set<Schema.SObjectField>{
      Location__c.Name,
      Location__c.SortOrder__c,
      Location__c.LocationType__c,
      Location__c.GroupsThatFit__c,
      Location__c.Notes__c
    },
    // The activity's "more rules" are saved by ActivityDetails, not here.
    Activity__c.SObjectType => new Set<Schema.SObjectField>{
      Activity__c.Name,
      Activity__c.SortOrder__c,
      Activity__c.Location__c,
      Activity__c.Length__c,
      Activity__c.TimesPerWeekMin__c,
      Activity__c.TimesPerWeekMax__c,
      Activity__c.NoWeeklyMax__c,
      Activity__c.Priority__c,
      Activity__c.Outdoor__c,
      Activity__c.RainPlan__c,
      Activity__c.GroupsAtOnce__c,
      Activity__c.NoGroupLimit__c
    },
    FixedActivity__c.SObjectType => new Set<Schema.SObjectField>{
      FixedActivity__c.Name,
      FixedActivity__c.SortOrder__c,
      FixedActivity__c.TimeBlock__c,
      FixedActivity__c.LastTimeBlock__c,
      FixedActivity__c.Length__c,
      FixedActivity__c.EarlyDay__c,
      FixedActivity__c.EarlyBlocks__c,
      FixedActivity__c.Location__c
    },
    RecurringActivity__c.SObjectType => new Set<Schema.SObjectField>{
      RecurringActivity__c.Name,
      RecurringActivity__c.SortOrder__c,
      RecurringActivity__c.TimeBlock__c,
      RecurringActivity__c.LastTimeBlock__c,
      RecurringActivity__c.Length__c,
      RecurringActivity__c.Location__c,
      RecurringActivity__c.Monday__c,
      RecurringActivity__c.Tuesday__c,
      RecurringActivity__c.Wednesday__c,
      RecurringActivity__c.Thursday__c,
      RecurringActivity__c.Friday__c,
      RecurringActivity__c.Saturday__c,
      RecurringActivity__c.Sunday__c
    },
    // The Special events screen (ADR 0014 choice 11); their plans are saved by SpecialPlans.
    SpecialDay__c.SObjectType => new Set<Schema.SObjectField>{
      SpecialDay__c.Name,
      SpecialDay__c.SortOrder__c,
      SpecialDay__c.Notes__c
    },
    SpecialEvent__c.SObjectType => new Set<Schema.SObjectField>{
      SpecialEvent__c.Name,
      SpecialEvent__c.SortOrder__c,
      SpecialEvent__c.Location__c,
      SpecialEvent__c.Notes__c
    },
    // The Electives screen (repo ADR 0018, slice E4); linked choices are edited in slice E8.
    ElectiveSet__c.SObjectType => new Set<Schema.SObjectField>{
      ElectiveSet__c.Name
    },
    Offering__c.SObjectType => new Set<Schema.SObjectField>{
      Offering__c.Activity__c,
      Offering__c.Seats__c,
      Offering__c.NoSeatLimit__c,
      Offering__c.MinimumToRun__c,
      Offering__c.Proposed__c
    }
  };
  // The parent each kind is created under: set when a row is added, never changed after (except
  // a group's division, above).
  private static final Map<Schema.SObjectType, Schema.SObjectField> PARENT_FIELD = new Map<Schema.SObjectType, Schema.SObjectField>{
    Season__c.SObjectType => Season__c.Camp__c,
    Week__c.SObjectType => Week__c.Season__c,
    Program__c.SObjectType => Program__c.Season__c,
    Division__c.SObjectType => Division__c.Program__c,
    Group__c.SObjectType => Group__c.Division__c,
    TimeBlock__c.SObjectType => TimeBlock__c.Program__c,
    LocationType__c.SObjectType => LocationType__c.Season__c,
    Location__c.SObjectType => Location__c.Season__c,
    Activity__c.SObjectType => Activity__c.Season__c,
    FixedActivity__c.SObjectType => FixedActivity__c.Program__c,
    RecurringActivity__c.SObjectType => RecurringActivity__c.Program__c,
    SpecialDay__c.SObjectType => SpecialDay__c.Season__c,
    SpecialEvent__c.SObjectType => SpecialEvent__c.Season__c,
    ElectiveSet__c.SObjectType => ElectiveSet__c.Season__c,
    Offering__c.SObjectType => Offering__c.ElectiveSet__c
  };

  /** What a table sends with its rows: week ticks, and who each recurring activity covers. */
  public class Extras {
    @AuraEnabled
    public List<RunsIn.WeekOff> weeksOff { get; set; }
    @AuraEnabled
    public List<Id> weeksBackOn { get; set; }
    @AuraEnabled
    public List<SetTimeWho.Who> who { get; set; }
    /** A row save only: who the row covered when the director changed it (RowSaves). */
    @AuraEnabled
    public List<Id> seenWho { get; set; }
    /** DIV-1.1: the program of a group added by hand with no division (NoDivisions). */
    @AuraEnabled
    public Id noDivisionProgram { get; set; }
  }

  /** Creates new records and updates existing ones, with their week ticks. Returns the Ids in order. */
  public static List<Id> save(
    List<SObject> records,
    List<RunsIn.WeekOff> weeksOff,
    List<Id> weeksBackOn
  ) {
    Extras extras = new Extras();
    extras.weeksOff = weeksOff;
    extras.weeksBackOn = weeksBackOn;
    return save(records, extras);
  }

  /** The same, with who each recurring activity covers. */
  public static List<Id> save(List<SObject> records, Extras extras) {
    List<SObject> rows = records == null ? new List<SObject>() : records;
    Extras given = extras == null ? new Extras() : extras;
    refuseWhatCannotBeSaved(rows);
    SetTimeGuard.defer();
    Savepoint beforeSave = Database.setSavepoint();
    try {
      NoDivisions.holdNew(rows, given.noDivisionProgram);
      RunsIn.save(rows, given.weeksOff, given.weeksBackOn);
      SetTimeWho.save(rows, given.who);
      SetTimeGuard.checkPending();
    } catch (Exception e) {
      Database.rollback(beforeSave);
      throw ScreenErrors.of(e);
    } finally {
      SetTimeGuard.resume();
    }
    List<Id> ids = new List<Id>();
    for (SObject record : rows) {
      ids.add(record.Id);
    }
    return ids;
  }

  /** Refuses a kind or field these screens don't save, before anything is read or written. */
  public static void refuseWhatCannotBeSaved(List<SObject> records) {
    for (SObject record : records) {
      refuseFieldsNotShown(record);
    }
    String ownRainPlan = ActivityDetails.ownRainPlanProblem(records);
    if (ownRainPlan != null) {
      throw ScreenErrors.of(ownRainPlan);
    }
  }

  /** Each kind's own fields only; its parent only on a new row. */
  private static void refuseFieldsNotShown(SObject record) {
    Schema.SObjectType kind = record.getSObjectType();
    Set<Schema.SObjectField> allowed = SAVABLE_FIELDS.get(kind);
    if (allowed == null) {
      throw ScreenErrors.of('These screens can\'t save that.');
    }
    Schema.SObjectField parent = record.Id == null
      ? PARENT_FIELD.get(kind)
      : null;
    // The screen's names (with the package's prefix once it has one) are turned into fields.
    for (String name : record.getPopulatedFieldsAsMap().keySet()) {
      Schema.SObjectField field = ShoreshSchema.field(kind, name);
      Boolean shown =
        allowed.contains(field) || (parent != null && field == parent);
      if (name != 'Id' && !shown) {
        throw ScreenErrors.of('These screens can\'t change that.');
      }
    }
  }
}
