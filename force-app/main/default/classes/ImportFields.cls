/**
 * The objects and fields an import may write (slice 4c part D, after the security review): the
 * only names Undo takes from an import's record. Import__c's Created__c and Changed__c are text a
 * scheduler can edit, so Undo never puts an object or field name from them into a query or a
 * write unless it is listed here.
 */
public with sharing class ImportFields {
  private static final Set<String> DAYS = new Set<String>{
    'Monday__c',
    'Tuesday__c',
    'Wednesday__c',
    'Thursday__c',
    'Friday__c'
  };
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
  private static final Map<Schema.SObjectType, Set<String>> WRITTEN = new Map<Schema.SObjectType, Set<String>>{
    Program__c.SObjectType => withDays(
      new Set<String>{ 'Name', 'Season__c', 'SortOrder__c' }
    ),
    Division__c.SObjectType => new Set<String>{
      'Name',
      'Program__c',
      'SortOrder__c'
    },
    Group__c.SObjectType => new Set<String>{
      'Name',
      'Division__c',
      'Availability__c',
      'SortOrder__c'
    },
    TimeBlock__c.SObjectType => new Set<String>{
      'Name',
      'Program__c',
      'SortOrder__c',
      'StartTime__c',
      'EndTime__c',
      'PartOfDay__c'
    },
    LocationType__c.SObjectType => new Set<String>{ 'Name', 'Season__c' },
    Location__c.SObjectType => new Set<String>{
      'Name',
      'Season__c',
      'GroupsThatFit__c',
      'LocationType__c',
      'Notes__c'
    },
    Activity__c.SObjectType => new Set<String>{
      'Name',
      'Season__c',
      'Location__c',
      'RainPlan__c',
      'SortOrder__c',
      'Length__c',
      'TimesPerWeekMin__c',
      'TimesPerWeekMax__c',
      'NoWeeklyMax__c',
      'Priority__c',
      'Outdoor__c',
      'GroupsAtOnce__c',
      'NoGroupLimit__c',
      'SameDivisionOnly__c',
      'EarlyWeekCount__c',
      'EarlyWeekByDay__c',
      'Notes__c'
    },
    ActivityEligibility__c.SObjectType => new Set<String>{
      'Activity__c',
      'Division__c',
      'Group__c',
      'Season__c'
    },
    FixedActivity__c.SObjectType => new Set<String>{
      'Name',
      'Program__c',
      'TimeBlock__c',
      'Location__c',
      'Length__c'
    },
    RecurringActivity__c.SObjectType => withDays(
      new Set<String>{
        'Name',
        'Program__c',
        'TimeBlock__c',
        'Location__c',
        'Length__c'
      }
    ),
    Coverage__c.SObjectType => new Set<String>{
      'Season__c',
      'RecurringActivity__c',
      'Division__c',
      'Group__c'
    },
    Schedule__c.SObjectType => new Set<String>{
      'Name',
      'Program__c',
      'Week__c',
      'Status__c',
      'Origin__c',
      'VersionReason__c'
    },
    Week__c.SObjectType => new Set<String>{
      'Name',
      'Season__c',
      'StartDate__c',
      'EndDate__c',
      'SortOrder__c'
    },
    WeekException__c.SObjectType => new Set<String>{
      'Week__c',
      'Group__c',
      'Location__c',
      'Activity__c',
      'FixedActivity__c',
      'RecurringActivity__c'
    },
    CampLabel__c.SObjectType => new Set<String>{
      'Camp__c',
      'ModelTerm__c',
      'Singular__c',
      'Plural__c'
    }
  };

  private static Set<String> withDays(Set<String> fields) {
    fields.addAll(DAYS);
    return fields;
  }

  /** The object an import's term names ("Group"), or the refusal. */
  public static Schema.SObjectType ofTerm(String term) {
    Schema.SObjectType type = TERMS.get(term);
    if (type == null) {
      throw unreadableLog();
    }
    return type;
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

  /** Refuses any field an import doesn't write on this object. */
  public static void check(Schema.SObjectType type, Set<String> names) {
    Set<String> allowed = WRITTEN.get(type);
    if (allowed == null || !allowed.containsAll(names)) {
      throw unreadableLog();
    }
  }

  /** How Undo names a record it kept: a camp word by the word, anything else by its name. */
  public static String nameOf(SObject record) {
    return (String) record.get(
      record.getSObjectType() == CampLabel__c.SObjectType
        ? 'Singular__c'
        : 'Name'
    );
  }

  public static ShoreshException unreadableLog() {
    return new ShoreshException(
      'Nothing was undone: this import\'s record can\'t be read.'
    );
  }
}
