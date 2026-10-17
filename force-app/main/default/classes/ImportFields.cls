/**
 * The objects and fields an import may write (slice 4c part D, after the security review): the
 * only names Undo takes from an import's record. Import__c's Created__c and Changed__c are text a
 * scheduler can edit, so Undo never puts an object or field name from them into a query or a
 * write unless it is listed here.
 *
 * Fields are the platform's own references, never names: a name read from a log (bare, as logs
 * keep them, or with the package's namespace prefix) is turned into its field first
 * (ShoreshSchema), then checked against these lists.
 */
public with sharing class ImportFields {
  // ImportWriter's names for what it creates, with their objects.
  private static final Map<String, Schema.SObjectType> TERMS = new Map<String, Schema.SObjectType>{
    'Program' => Program__c.SObjectType,
    'Division' => Division__c.SObjectType,
    'Group' => Group__c.SObjectType,
    'TimeBlock' => TimeBlock__c.SObjectType,
    'LocationType' => LocationType__c.SObjectType,
    'Location' => Location__c.SObjectType,
    'Activity' => Activity__c.SObjectType,
    'ActivityEligibility' => ActivityEligibility__c.SObjectType,
    'FixedActivity' => FixedActivity__c.SObjectType,
    'RecurringActivity' => RecurringActivity__c.SObjectType,
    'Coverage' => Coverage__c.SObjectType,
    'Schedule' => Schedule__c.SObjectType,
    'Week' => Week__c.SObjectType,
    'WeekException' => WeekException__c.SObjectType,
    'CampLabel' => CampLabel__c.SObjectType
  };
  // Every field any import writes, per object (ImportListRows, ImportItemWrites,
  // ImportStructureWrites, ImportVersionWrites, ImportWhoKinds, and the workbook's kinds).
  private static final Map<Schema.SObjectType, Set<Schema.SObjectField>> WRITTEN = new Map<Schema.SObjectType, Set<Schema.SObjectField>>{
    Program__c.SObjectType => new Set<Schema.SObjectField>{
      Program__c.Name,
      Program__c.Season__c,
      Program__c.SortOrder__c,
      Program__c.Monday__c,
      Program__c.Tuesday__c,
      Program__c.Wednesday__c,
      Program__c.Thursday__c,
      Program__c.Friday__c
    },
    Division__c.SObjectType => new Set<Schema.SObjectField>{
      Division__c.Name,
      Division__c.Program__c,
      Division__c.SortOrder__c
    },
    Group__c.SObjectType => new Set<Schema.SObjectField>{
      Group__c.Name,
      Group__c.Division__c,
      Group__c.Availability__c,
      Group__c.SortOrder__c
    },
    TimeBlock__c.SObjectType => new Set<Schema.SObjectField>{
      TimeBlock__c.Name,
      TimeBlock__c.Program__c,
      TimeBlock__c.SortOrder__c,
      TimeBlock__c.StartTime__c,
      TimeBlock__c.EndTime__c,
      TimeBlock__c.PartOfDay__c
    },
    LocationType__c.SObjectType => new Set<Schema.SObjectField>{
      LocationType__c.Name,
      LocationType__c.Season__c
    },
    Location__c.SObjectType => new Set<Schema.SObjectField>{
      Location__c.Name,
      Location__c.Season__c,
      Location__c.GroupsThatFit__c,
      Location__c.LocationType__c,
      Location__c.Notes__c
    },
    Activity__c.SObjectType => new Set<Schema.SObjectField>{
      Activity__c.Name,
      Activity__c.Season__c,
      Activity__c.Location__c,
      Activity__c.RainPlan__c,
      Activity__c.SortOrder__c,
      Activity__c.Length__c,
      Activity__c.TimesPerWeekMin__c,
      Activity__c.TimesPerWeekMax__c,
      Activity__c.NoWeeklyMax__c,
      Activity__c.Priority__c,
      Activity__c.Outdoor__c,
      Activity__c.GroupsAtOnce__c,
      Activity__c.NoGroupLimit__c,
      Activity__c.SameDivisionOnly__c,
      Activity__c.EarlyWeekCount__c,
      Activity__c.EarlyWeekByDay__c,
      Activity__c.Notes__c
    },
    ActivityEligibility__c.SObjectType => new Set<Schema.SObjectField>{
      ActivityEligibility__c.Activity__c,
      ActivityEligibility__c.Division__c,
      ActivityEligibility__c.Group__c
    },
    FixedActivity__c.SObjectType => new Set<Schema.SObjectField>{
      FixedActivity__c.Name,
      FixedActivity__c.Program__c,
      FixedActivity__c.TimeBlock__c,
      FixedActivity__c.Location__c,
      FixedActivity__c.Length__c
    },
    RecurringActivity__c.SObjectType => new Set<Schema.SObjectField>{
      RecurringActivity__c.Name,
      RecurringActivity__c.Program__c,
      RecurringActivity__c.TimeBlock__c,
      RecurringActivity__c.Location__c,
      RecurringActivity__c.Length__c,
      RecurringActivity__c.Monday__c,
      RecurringActivity__c.Tuesday__c,
      RecurringActivity__c.Wednesday__c,
      RecurringActivity__c.Thursday__c,
      RecurringActivity__c.Friday__c
    },
    Coverage__c.SObjectType => new Set<Schema.SObjectField>{
      Coverage__c.Season__c,
      Coverage__c.RecurringActivity__c,
      Coverage__c.Division__c,
      Coverage__c.Group__c
    },
    Schedule__c.SObjectType => new Set<Schema.SObjectField>{
      Schedule__c.Name,
      Schedule__c.Program__c,
      Schedule__c.Week__c,
      Schedule__c.Status__c,
      Schedule__c.Origin__c,
      Schedule__c.VersionReason__c
    },
    Week__c.SObjectType => new Set<Schema.SObjectField>{
      Week__c.Name,
      Week__c.Season__c,
      Week__c.StartDate__c,
      Week__c.EndDate__c,
      Week__c.SortOrder__c
    },
    WeekException__c.SObjectType => new Set<Schema.SObjectField>{
      WeekException__c.Week__c,
      WeekException__c.Group__c,
      WeekException__c.Location__c,
      WeekException__c.Activity__c,
      WeekException__c.FixedActivity__c,
      WeekException__c.RecurringActivity__c
    },
    CampLabel__c.SObjectType => new Set<Schema.SObjectField>{
      CampLabel__c.Camp__c,
      CampLabel__c.ModelTerm__c,
      CampLabel__c.Singular__c,
      CampLabel__c.Plural__c
    }
  };

  /** The object an import's term names ("Group"), or the refusal. */
  public static Schema.SObjectType ofTerm(String term) {
    Schema.SObjectType type = TERMS.get(term);
    if (type == null) {
      throw unreadableLog();
    }
    return type;
  }

  /** An object's term ("Group" for Group__c), as ImportWriter counts and logs it. */
  public static String termOf(Schema.SObjectType type) {
    for (String term : TERMS.keySet()) {
      if (TERMS.get(term) == type) {
        return term;
      }
    }
    throw unreadableLog();
  }

  /** The object of a record an import wrote, or the refusal: never one an import doesn't write. */
  public static Schema.SObjectType ofRecord(Object recordId) {
    Id parsed;
    try {
      parsed = (Id) (String) recordId;
    } catch (Exception e) {
      throw unreadableLog();
    }
    Schema.SObjectType type = parsed == null ? null : parsed.getSObjectType();
    if (type == null || !WRITTEN.containsKey(type)) {
      throw unreadableLog();
    }
    return type;
  }

  /** The field a name from an import's record means, or the refusal: only fields imports write. */
  public static Schema.SObjectField field(
    Schema.SObjectType type,
    Object name
  ) {
    Set<Schema.SObjectField> allowed = WRITTEN.get(type);
    Schema.SObjectField found = name instanceof String
      ? ShoreshSchema.field(type, (String) name)
      : null;
    if (allowed == null || found == null || !allowed.contains(found)) {
      throw unreadableLog();
    }
    return found;
  }

  /** Refuses any field an import doesn't write on this object. */
  public static void check(Schema.SObjectType type, Set<String> names) {
    for (String name : names) {
      field(type, name);
    }
  }

  /** How Undo names a record it kept: a camp word by the word, anything else by its name. */
  public static String nameOf(SObject record) {
    return record.getSObjectType() == CampLabel__c.SObjectType
      ? (String) record.get(CampLabel__c.Singular__c)
      : (String) record.get('Name');
  }

  public static ShoreshException unreadableLog() {
    return new ShoreshException(
      'Nothing was undone: this import\'s record can\'t be read.'
    );
  }
}
