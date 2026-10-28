/**
 * The rows of a setup list's save (slice 4c, ImportListSaves): what a list may write for each
 * kind, and each record built from the screen's entry. Only the fields listed here are written;
 * a list never renames anything, and only adds the kinds it cannot change.
 */
public with sharing class ImportListRows {
  // Kinds that are children of the season itself, with the field naming it (the others are
  // inside a program).
  private static final Map<String, Schema.SObjectField> SEASON_FIELD = new Map<String, Schema.SObjectField>{
    'Week' => Week__c.Season__c,
    'Program' => Program__c.Season__c,
    'LocationType' => LocationType__c.Season__c,
    'Location' => Location__c.Season__c,
    'Activity' => Activity__c.Season__c,
    'ElectiveSet' => ElectiveSet__c.Season__c
  };
  // What a list may write, per kind: plain fields...
  private static final Map<String, Set<Schema.SObjectField>> PLAIN_FIELDS = new Map<String, Set<Schema.SObjectField>>{
    'Program' => new Set<Schema.SObjectField>{
      Program__c.Name,
      Program__c.Monday__c,
      Program__c.Tuesday__c,
      Program__c.Wednesday__c,
      Program__c.Thursday__c,
      Program__c.Friday__c,
      Program__c.Saturday__c,
      Program__c.Sunday__c
    },
    'LocationType' => new Set<Schema.SObjectField>{ LocationType__c.Name },
    // Only a camp workbook (part D): weeks, and the weeks an item is off.
    'Week' => new Set<Schema.SObjectField>{
      Week__c.Name,
      Week__c.StartDate__c,
      Week__c.EndDate__c
    },
    'WeekException' => new Set<Schema.SObjectField>(),
    'Location' => new Set<Schema.SObjectField>{
      Location__c.Name,
      Location__c.GroupsThatFit__c,
      Location__c.Notes__c
    },
    'TimeBlock' => new Set<Schema.SObjectField>{
      TimeBlock__c.Name,
      TimeBlock__c.StartTime__c,
      TimeBlock__c.EndTime__c,
      TimeBlock__c.PartOfDay__c
    },
    'FixedActivity' => new Set<Schema.SObjectField>{
      FixedActivity__c.Name,
      FixedActivity__c.Length__c
    },
    'RecurringActivity' => new Set<Schema.SObjectField>{
      RecurringActivity__c.Name,
      RecurringActivity__c.Length__c,
      RecurringActivity__c.Monday__c,
      RecurringActivity__c.Tuesday__c,
      RecurringActivity__c.Wednesday__c,
      RecurringActivity__c.Thursday__c,
      RecurringActivity__c.Friday__c,
      RecurringActivity__c.Saturday__c,
      RecurringActivity__c.Sunday__c
    },
    // DIV-1.1: a new group in no division comes with its flagged holding record.
    'Division' => new Set<Schema.SObjectField>{
      Division__c.Name,
      Division__c.NoDivision__c
    },
    'Group' => new Set<Schema.SObjectField>{
      Group__c.Name,
      Group__c.Availability__c
    },
    'Activity' => new Set<Schema.SObjectField>{
      Activity__c.Name,
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
    // The Electives screen's list (plan §6.2): a set is only ever added, by its name; an
    // offering is named by its activity, so it has no name of its own to write.
    'ElectiveSet' => new Set<Schema.SObjectField>{ ElectiveSet__c.Name },
    'Offering' => new Set<Schema.SObjectField>{
      Offering__c.Seats__c,
      Offering__c.NoSeatLimit__c,
      Offering__c.MinimumToRun__c,
      Offering__c.Proposed__c
    }
  };
  // ...and fields naming another record.
  private static final Map<String, Set<Schema.SObjectField>> LINK_FIELDS = new Map<String, Set<Schema.SObjectField>>{
    'Program' => new Set<Schema.SObjectField>(),
    'LocationType' => new Set<Schema.SObjectField>(),
    'Week' => new Set<Schema.SObjectField>(),
    'WeekException' => new Set<Schema.SObjectField>{
      WeekException__c.Week__c,
      WeekException__c.Group__c,
      WeekException__c.Location__c,
      WeekException__c.Activity__c,
      WeekException__c.FixedActivity__c,
      WeekException__c.RecurringActivity__c
    },
    'Location' => new Set<Schema.SObjectField>{ Location__c.LocationType__c },
    'TimeBlock' => new Set<Schema.SObjectField>{ TimeBlock__c.Program__c },
    'FixedActivity' => new Set<Schema.SObjectField>{
      FixedActivity__c.Program__c,
      FixedActivity__c.TimeBlock__c,
      FixedActivity__c.Location__c
    },
    'RecurringActivity' => new Set<Schema.SObjectField>{
      RecurringActivity__c.Program__c,
      RecurringActivity__c.TimeBlock__c,
      RecurringActivity__c.Location__c
    },
    'Division' => new Set<Schema.SObjectField>{ Division__c.Program__c },
    'Group' => new Set<Schema.SObjectField>{ Group__c.Division__c },
    'Activity' => new Set<Schema.SObjectField>{
      Activity__c.Location__c,
      Activity__c.RainPlan__c
    },
    'ElectiveSet' => new Set<Schema.SObjectField>(),
    'Offering' => new Set<Schema.SObjectField>{
      Offering__c.ElectiveSet__c,
      Offering__c.Activity__c
    }
  };
  // Kinds a list can change once set up (divisions and location types it only adds).
  private static final Set<String> CHANGEABLE = new Set<String>{
    'Week',
    'Program',
    'Location',
    'Group',
    'TimeBlock',
    'Activity',
    'FixedActivity',
    'RecurringActivity',
    'Offering'
  };
  // Links set only on a new record: what program it is in (a group moves with its division
  // field, within its program: GroupMoves); an offering's set and activity, which are what it is.
  private static final Set<Schema.SObjectField> NEW_ONLY_LINKS = new Set<Schema.SObjectField>{
    TimeBlock__c.Program__c,
    FixedActivity__c.Program__c,
    RecurringActivity__c.Program__c,
    Division__c.Program__c,
    Offering__c.ElectiveSet__c,
    Offering__c.Activity__c
  };
  private static final Set<String> WORKBOOK_ONLY = new Set<String>{
    'Week',
    'WeekException'
  };
  private Id seasonId;
  private ImportKeys keys;
  private String kind;
  private Schema.SObjectType type;

  public ImportListRows(Id seasonId, ImportKeys keys, String kind) {
    this.seasonId = seasonId;
    this.keys = keys;
    this.kind = kind;
    this.type = ImportFields.ofTerm(kind);
  }

  /** Whether a screen's list can write this kind at all. */
  public static Boolean isListKind(String kind) {
    return PLAIN_FIELDS.containsKey(kind) && !WORKBOOK_ONLY.contains(kind);
  }

  /** Whether a camp workbook can write this kind at all (weeks and weeks off too). */
  public static Boolean isWorkbookKind(String kind) {
    return PLAIN_FIELDS.containsKey(kind);
  }

  /** A new record (in the season, where its kind is) or an existing one, with its plain fields. */
  public SObject rowFor(ImportPlan.Entry entry) {
    SObject row = entry.isNew() ? newRow() : existingRow(entry.id());
    Map<String, Object> values = entry.valuesOf('fields');
    // One field sent twice (spelled with and without the prefix) is refused, not guessed at.
    Set<Schema.SObjectField> seen = new Set<Schema.SObjectField>();
    for (String name : values.keySet()) {
      // The screen names fields (with the package's prefix once it has one).
      Schema.SObjectField field = ShoreshSchema.field(type, name);
      // A list never renames anything (names are how rows find what is set up); a week is
      // found by the day it starts, so its name can change and its start can't.
      Boolean renaming =
        field != null &&
        ShoreshSchema.localName(field) == 'Name' &&
        !entry.isNew() &&
        kind != 'Week';
      Boolean moving = field == Week__c.StartDate__c && !entry.isNew();
      if (
        !PLAIN_FIELDS.get(kind).contains(field) ||
        renaming ||
        moving ||
        !seen.add(field)
      ) {
        throw ImportListSaves.unreadable();
      }
      row.put(field, ImportUndoValues.asField(field, values.get(name)));
    }
    return row;
  }

  private SObject newRow() {
    SObject row = type.newSObject();
    if (SEASON_FIELD.containsKey(kind)) {
      row.put(SEASON_FIELD.get(kind), seasonId);
    }
    return row;
  }

  private SObject existingRow(Id recordId) {
    // Only kinds a list changes, and only a record of that kind.
    if (!CHANGEABLE.contains(kind) || recordId.getSObjectType() != type) {
      throw ImportListSaves.unreadable();
    }
    return type.newSObject(keys.existing(recordId));
  }

  /**
   * Puts in the links to other records; returns the ones to a record of the same kind not saved
   * yet ([field, key], the field a Schema.SObjectField), to be written after.
   */
  public List<List<Object>> putLinks(SObject row, ImportPlan.Entry entry) {
    List<List<Object>> waiting = new List<List<Object>>();
    Map<String, Object> links = entry.valuesOf('refs');
    Set<Schema.SObjectField> seen = new Set<Schema.SObjectField>();
    for (String name : links.keySet()) {
      Schema.SObjectField field = ShoreshSchema.field(type, name);
      Boolean moving = NEW_ONLY_LINKS.contains(field) && !entry.isNew();
      if (
        !LINK_FIELDS.get(kind).contains(field) ||
        moving ||
        !seen.add(field)
      ) {
        throw ImportListSaves.unreadable();
      }
      String target = (String) links.get(name);
      Boolean sameKindNotYet =
        target != null &&
        target.startsWith(kind + ':') &&
        !keys.knows(target);
      if (sameKindNotYet) {
        waiting.add(new List<Object>{ field, target });
      } else {
        row.put(field, keys.of(target));
      }
    }
    return waiting;
  }
}
