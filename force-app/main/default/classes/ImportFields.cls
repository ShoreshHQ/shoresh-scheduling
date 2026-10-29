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
    'CampLabel' => CampLabel__c.SObjectType,
    'ElectiveSet' => ElectiveSet__c.SObjectType,
    'Offering' => Offering__c.SObjectType,
    // Import last year's double periods (slice E9).
    'LinkedChoice' => LinkedChoice__c.SObjectType,
    'LinkedChoiceTime' => LinkedChoiceTime__c.SObjectType,
    // Import last year's week day with its own time blocks (INGEST-4.3).
    'SpecialDay' => SpecialDay__c.SObjectType,
    'SpecialDate' => SpecialDate__c.SObjectType,
    // A batch from another system (IncomingBatch): campers, their choices and bunks.
    'Camper' => Camper__c.SObjectType,
    'Preference' => Preference__c.SObjectType
  };
  // Every field any import writes, per object (ImportListRows, ImportItemWrites,
  // ImportStructureWrites, ImportElectiveWrites, ImportVersionWrites, ImportWhoKinds, and the
  // workbook's kinds).
  private static final Map<Schema.SObjectType, Set<Schema.SObjectField>> WRITTEN = new Map<Schema.SObjectType, Set<Schema.SObjectField>>{
    Program__c.SObjectType => new Set<Schema.SObjectField>{
      Program__c.Name,
      Program__c.Season__c,
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
      Division__c.Program__c,
      Division__c.SortOrder__c,
      // DIV-1.1: a holding record of a group in no division.
      Division__c.NoDivision__c
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
      FixedActivity__c.Length__c,
      FixedActivity__c.EarlyDay__c,
      FixedActivity__c.EarlyBlocks__c
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
      RecurringActivity__c.Friday__c,
      RecurringActivity__c.Saturday__c,
      RecurringActivity__c.Sunday__c
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
    },
    ElectiveSet__c.SObjectType => new Set<Schema.SObjectField>{
      ElectiveSet__c.Name,
      ElectiveSet__c.Season__c
    },
    Offering__c.SObjectType => new Set<Schema.SObjectField>{
      Offering__c.ElectiveSet__c,
      Offering__c.Activity__c,
      Offering__c.Seats__c,
      Offering__c.NoSeatLimit__c,
      Offering__c.MinimumToRun__c,
      Offering__c.Proposed__c
    },
    LinkedChoice__c.SObjectType => new Set<Schema.SObjectField>{
      LinkedChoice__c.Name,
      LinkedChoice__c.ElectiveSet__c,
      LinkedChoice__c.Offering__c,
      LinkedChoice__c.AppliesTo__c,
      LinkedChoice__c.SortOrder__c
    },
    LinkedChoiceTime__c.SObjectType => new Set<Schema.SObjectField>{
      LinkedChoiceTime__c.LinkedChoice__c,
      LinkedChoiceTime__c.Weekday__c,
      LinkedChoiceTime__c.TimeBlock__c
    },
    SpecialDay__c.SObjectType => new Set<Schema.SObjectField>{
      SpecialDay__c.Name,
      SpecialDay__c.Season__c
    },
    SpecialDate__c.SObjectType => new Set<Schema.SObjectField>{
      SpecialDate__c.Season__c,
      SpecialDate__c.SpecialDay__c,
      SpecialDate__c.Week__c,
      SpecialDate__c.Day__c
    },
    Camper__c.SObjectType => new Set<Schema.SObjectField>{
      Camper__c.Name,
      Camper__c.Season__c,
      Camper__c.CamperNumber__c,
      Camper__c.OutsideId__c,
      Camper__c.SourceSystem__c,
      Camper__c.Withdrawn__c,
      Camper__c.OutsideChangedAt__c
    },
    Preference__c.SObjectType => new Set<Schema.SObjectField>{
      Preference__c.ElectiveRun__c,
      Preference__c.Camper__c,
      Preference__c.Group__c,
      Preference__c.Choices__c,
      Preference__c.ImportedChoices__c,
      Preference__c.ChoicesChangedAt__c
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
    // Only objects imports write are counted: anything else is Shoresh's own mistake.
    throw new IllegalArgumentException('Not a kind imports write: ' + type);
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

  /** Refuses any field an import doesn't write on this object, or one named twice. */
  public static void check(Schema.SObjectType type, Set<String> names) {
    Set<Schema.SObjectField> seen = new Set<Schema.SObjectField>();
    for (String name : names) {
      if (!seen.add(field(type, name))) {
        throw unreadableLog();
      }
    }
  }

  /**
   * How Undo names a record it kept: a camp word by the word, an offering by its activity (its
   * own name is a number; ImportUndoValues.read reads the activity's), anything else by its name.
   */
  public static String nameOf(SObject record) {
    if (record.getSObjectType() == CampLabel__c.SObjectType) {
      return (String) record.get(CampLabel__c.Singular__c);
    }
    if (record.getSObjectType() == Offering__c.SObjectType) {
      SObject activity = record.getSObject(Offering__c.Activity__c);
      return activity == null ? null : (String) activity.get('Name');
    }
    return (String) record.get('Name');
  }

  /** The activity's name, as an offering is named (nameOf), for a query of offerings. */
  public static String offeringNameColumn() {
    return Offering__c.Activity__c.getDescribe().getRelationshipName() +
      '.Name';
  }

  public static ShoreshException unreadableLog() {
    return new ShoreshException(
      'Nothing was undone: this import\'s record can\'t be read.'
    );
  }
}
