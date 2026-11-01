/**
 * The fields of a setup record a person's AI may set (docs/protocol/api.md API-1.49, API-1.50):
 * exactly the ones Camp Setup's tables save for that kind (ScreenSaves), by plain names like
 * start_time or location, each value read as a camp types it ("9:00 AM", "Pool", "yes"). A field
 * the kind doesn't have, or a value that doesn't read, is refused naming what would; a name two
 * records share is refused naming both, never picked.
 */
public with sharing class AgentSetupFields {
  private static final List<String> DAYS = new List<String>{
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday'
  };

  // Each kind's fields by plain name, in the screen's order (its name is rename_setup_record's).
  private static final Map<String, Map<String, Schema.SObjectField>> FIELDS = new Map<String, Map<String, Schema.SObjectField>>{
    'Week' => new Map<String, Schema.SObjectField>{
      'start_date' => Week__c.StartDate__c,
      'end_date' => Week__c.EndDate__c
    },
    'Program' => new Map<String, Schema.SObjectField>{
      'monday' => Program__c.Monday__c,
      'tuesday' => Program__c.Tuesday__c,
      'wednesday' => Program__c.Wednesday__c,
      'thursday' => Program__c.Thursday__c,
      'friday' => Program__c.Friday__c,
      'saturday' => Program__c.Saturday__c,
      'sunday' => Program__c.Sunday__c
    },
    'Division' => new Map<String, Schema.SObjectField>(),
    'Group' => new Map<String, Schema.SObjectField>{
      'division' => Group__c.Division__c,
      'availability' => Group__c.Availability__c
    },
    'TimeBlock' => new Map<String, Schema.SObjectField>{
      'start_time' => TimeBlock__c.StartTime__c,
      'end_time' => TimeBlock__c.EndTime__c,
      'part_of_day' => TimeBlock__c.PartOfDay__c
    },
    'LocationType' => new Map<String, Schema.SObjectField>(),
    'Location' => new Map<String, Schema.SObjectField>{
      'location_type' => Location__c.LocationType__c,
      'groups_that_fit' => Location__c.GroupsThatFit__c,
      'notes' => Location__c.Notes__c
    },
    'Activity' => new Map<String, Schema.SObjectField>{
      'location' => Activity__c.Location__c,
      'length' => Activity__c.Length__c,
      'times_per_week_min' => Activity__c.TimesPerWeekMin__c,
      'times_per_week_max' => Activity__c.TimesPerWeekMax__c,
      'no_weekly_max' => Activity__c.NoWeeklyMax__c,
      'priority' => Activity__c.Priority__c,
      'outdoor' => Activity__c.Outdoor__c,
      'rain_plan' => Activity__c.RainPlan__c,
      'groups_at_once' => Activity__c.GroupsAtOnce__c,
      'no_group_limit' => Activity__c.NoGroupLimit__c
    },
    'FixedActivity' => new Map<String, Schema.SObjectField>{
      'time_block' => FixedActivity__c.TimeBlock__c,
      'last_time_block' => FixedActivity__c.LastTimeBlock__c,
      'length' => FixedActivity__c.Length__c,
      'early_day' => FixedActivity__c.EarlyDay__c,
      'early_blocks' => FixedActivity__c.EarlyBlocks__c,
      'location' => FixedActivity__c.Location__c
    },
    'RecurringActivity' => new Map<String, Schema.SObjectField>{
      'time_block' => RecurringActivity__c.TimeBlock__c,
      'last_time_block' => RecurringActivity__c.LastTimeBlock__c,
      'length' => RecurringActivity__c.Length__c,
      'location' => RecurringActivity__c.Location__c,
      'monday' => RecurringActivity__c.Monday__c,
      'tuesday' => RecurringActivity__c.Tuesday__c,
      'wednesday' => RecurringActivity__c.Wednesday__c,
      'thursday' => RecurringActivity__c.Thursday__c,
      'friday' => RecurringActivity__c.Friday__c,
      'saturday' => RecurringActivity__c.Saturday__c,
      'sunday' => RecurringActivity__c.Sunday__c
    },
    'SpecialDay' => new Map<String, Schema.SObjectField>{
      'notes' => SpecialDay__c.Notes__c
    },
    'SpecialEvent' => new Map<String, Schema.SObjectField>{
      'location' => SpecialEvent__c.Location__c,
      'notes' => SpecialEvent__c.Notes__c
    },
    'ElectiveSet' => new Map<String, Schema.SObjectField>()
  };

  /** What a set of fields became: the row's extras (a group sent to no division) and the words. */
  public class Put {
    public ScreenSaves.Extras extras = new ScreenSaves.Extras();
    public List<String> said = new List<String>();
    public List<Schema.SObjectField> fields = new List<Schema.SObjectField>();
  }

  /** The fields a kind has, by plain name. */
  public static List<String> namesOf(String term) {
    return new List<String>(FIELDS.get(term).keySet());
  }

  /** One of a kind's fields by its plain name. */
  public static Schema.SObjectField fieldOf(String term, String key) {
    return FIELDS.get(term).get(key);
  }

  /** "A group", "An activity": the kind as a sentence starts it. */
  public static String aOrAn(String kind) {
    return ('aeiou'.contains(kind.left(1).toLowerCase()) ? 'An ' : 'A ') + kind;
  }

  /** Whether a kind sits in a program (its program is asked when adding one). */
  public static Boolean inProgram(String term) {
    return new Set<String>{
        'Division',
        'Group',
        'TimeBlock',
        'FixedActivity',
        'RecurringActivity'
      }
      .contains(term);
  }

  /**
   * Puts each field asked (fields: {plain name: value}) on the record, read as Camp Setup's
   * table would take it. found: the kind, its season and program (for names like a location).
   */
  public static Put put(
    SObject record,
    Object asked,
    AgentSetupRecords.Found found
  ) {
    Map<String, Object> given = given(asked);
    Map<String, Schema.SObjectField> known = FIELDS.get(found.term);
    Put result = new Put();
    for (String key : given.keySet()) {
      Schema.SObjectField field = known.get(key);
      if (field == null) {
        throw new ShoreshException(
          known.isEmpty()
            ? AgentSetupFields.aOrAn(found.kind) +
              ' has nothing to set but its name (rename_setup_record renames it).'
            : AgentSetupFields.aOrAn(found.kind) +
              ' has no field "' +
              key.left(40) +
              '". Its fields: ' +
              String.join(namesOf(found.term), ', ') +
              '.'
        );
      }
    }
    // In the screen's order, whatever order they were asked in (same ask, same answer).
    for (String key : known.keySet()) {
      if (!given.containsKey(key)) {
        continue;
      }
      Schema.SObjectField field = known.get(key);
      Object value = valueOf(key, field, text(given.get(key)), found, result);
      record.put(field, value);
      result.fields.add(field);
      result.said.add(
        key.replace('_', ' ') + ' ' + shown(given.get(key), value)
      );
    }
    return result;
  }

  /**
   * The fields asked, by plain name: an object, or (from the command line) its JSON as text.
   */
  public static Map<String, Object> given(Object asked) {
    Object fields = asked;
    if (asked instanceof String && String.isNotBlank((String) asked)) {
      try {
        fields = JSON.deserializeUntyped((String) asked);
      } catch (JSONException e) {
        fields = asked;
      }
    }
    if (
      fields == null ||
      (fields instanceof String && String.isBlank((String) fields))
    ) {
      return new Map<String, Object>();
    }
    if (!(fields instanceof Map<String, Object>)) {
      throw new ShoreshException(
        'The fields are given by name, like "fields": {"length": "2"}.'
      );
    }
    return (Map<String, Object>) fields;
  }

  private static String text(Object value) {
    return value == null ? '' : String.valueOf(value).normalizeSpace();
  }

  private static String shown(Object asked, Object value) {
    return value == null ? 'left blank' : text(asked);
  }

  /** One value as the table's field takes it. */
  private static Object valueOf(
    String key,
    Schema.SObjectField field,
    String asked,
    AgentSetupRecords.Found found,
    Put result
  ) {
    Schema.DescribeFieldResult about = field.getDescribe();
    Schema.DisplayType type = about.getType();
    if (type == Schema.DisplayType.REFERENCE || type == Schema.DisplayType.ID) {
      return idCalled(key, asked, found, result);
    }
    if (type == Schema.DisplayType.BOOLEAN) {
      String yes = asked.toLowerCase();
      if (new Set<String>{ 'yes', 'true', 'y', 'on' }.contains(yes)) {
        return true;
      }
      if (new Set<String>{ 'no', 'false', 'n', 'off' }.contains(yes)) {
        return false;
      }
      throw new ShoreshException(
        'Say yes or no for ' + key.replace('_', ' ') + ' (' + key + ').'
      );
    }
    if (String.isBlank(asked)) {
      return null;
    }
    if (type == Schema.DisplayType.DATE) {
      try {
        return Date.valueOf(asked);
      } catch (Exception e) {
        throw new ShoreshException(
          'Give the ' + key.replace('_', ' ') + ' as a date like 2026-07-06.'
        );
      }
    }
    if (type == Schema.DisplayType.TIME) {
      return timeOf(key, asked);
    }
    if (
      type == Schema.DisplayType.DOUBLE ||
      type == Schema.DisplayType.INTEGER
    ) {
      try {
        return Decimal.valueOf(asked);
      } catch (Exception e) {
        throw new ShoreshException(
          'Give the ' + key.replace('_', ' ') + ' as a number, like 2.'
        );
      }
    }
    if (type == Schema.DisplayType.PICKLIST) {
      List<String> labels = new List<String>();
      for (Schema.PicklistEntry entry : about.getPicklistValues()) {
        if (
          IncomingBatch.fold(entry.getLabel()) == IncomingBatch.fold(asked) ||
          IncomingBatch.fold(entry.getValue()) == IncomingBatch.fold(asked)
        ) {
          return entry.getValue();
        }
        labels.add(entry.getLabel());
      }
      throw new ShoreshException(
        'The ' +
          key.replace('_', ' ') +
          ' is one of: ' +
          String.join(labels, ', ') +
          '.'
      );
    }
    return asked;
  }

  /** A time as camps type it: 9:00, 9:00 AM, 9am, 14:30. */
  private static Time timeOf(String key, String asked) {
    String t = asked.toLowerCase().replace(' ', '').replace('.', '');
    Boolean pm = t.endsWith('pm');
    Boolean am = t.endsWith('am');
    if (pm || am) {
      t = t.left(t.length() - 2);
    }
    List<String> parts = t.split(':');
    Integer hour;
    Integer minute = 0;
    try {
      hour = Integer.valueOf(parts[0]);
      if (parts.size() == 2) {
        minute = Integer.valueOf(parts[1]);
      }
    } catch (Exception e) {
      hour = null;
    }
    Boolean fits =
      hour != null &&
      parts.size() <= 2 &&
      minute >= 0 &&
      minute < 60 &&
      ((pm || am) ? hour >= 1 && hour <= 12 : hour >= 0 && hour < 24);
    if (!fits) {
      throw new ShoreshException(
        'Give the ' + key.replace('_', ' ') + ' as a time like 9:00 AM.'
      );
    }
    if (pm && hour < 12) {
      hour += 12;
    } else if (am && hour == 12) {
      hour = 0;
    }
    return Time.newInstance(hour, minute, 0, 0);
  }

  /**
   * The record a name field names, among the ones the screen's picklist offers: the season's
   * locations, location types or activities, or the program's divisions or time blocks. Left
   * blank (or "none") it is cleared; a group's division "none" is No division (DIV-1.1).
   */
  private static Id idCalled(
    String key,
    String asked,
    AgentSetupRecords.Found found,
    Put result
  ) {
    Boolean none = String.isBlank(asked) || IncomingBatch.fold(asked) == 'none';
    if (none && key == 'division') {
      result.extras.noDivisionProgram = found.programId;
      return null;
    }
    if (none && key == 'time_block') {
      // The table's Time block column is required.
      throw new ShoreshException(
        AgentSetupFields.aOrAn(found.kind) +
        ' needs its time block (time_block).'
      );
    }
    if (none) {
      return null;
    }
    String term;
    List<SObject> rows;
    Id seasonId = found.seasonId;
    Id programId = found.programId;
    if (key == 'location') {
      term = 'Location';
      rows = [
        SELECT Id, Name
        FROM Location__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
        ORDER BY SortOrder__c, Name
      ];
    } else if (key == 'location_type') {
      term = 'LocationType';
      rows = [
        SELECT Id, Name
        FROM LocationType__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
        ORDER BY SortOrder__c, Name
      ];
    } else if (key == 'rain_plan') {
      term = 'Activity';
      rows = [
        SELECT Id, Name
        FROM Activity__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
        ORDER BY SortOrder__c, Name
      ];
    } else if (key == 'division') {
      term = 'Division';
      rows = [
        SELECT Id, Name
        FROM Division__c
        WHERE Program__c = :programId AND NoDivision__c = FALSE
        WITH USER_MODE
        ORDER BY SortOrder__c, Name
      ];
    } else {
      term = 'TimeBlock';
      rows = [
        SELECT Id, Name
        FROM TimeBlock__c
        WHERE Program__c = :programId
        WITH USER_MODE
        ORDER BY SortOrder__c, StartTime__c, Name
      ];
    }
    String word = found.labels.singularInSentence(term);
    List<String> names = new List<String>();
    Id match;
    for (SObject row : rows) {
      String name = (String) row.get('Name');
      names.add(name);
      if (IncomingBatch.fold(name) != IncomingBatch.fold(asked)) {
        continue;
      }
      if (match != null) {
        throw new ShoreshException(
          'More than one ' +
            word +
            ' is called "' +
            asked.left(80) +
            '", so Shoresh can\'t tell which you mean. Rename one in Shoresh, then ask again.'
        );
      }
      match = row.Id;
    }
    if (match == null) {
      throw new ShoreshException(
        'There is no ' +
          word +
          ' called "' +
          asked.left(80) +
          '" that this user can see. ' +
          AgentWeeks.namesSaid(found.labels.pluralInSentence(term), names)
      );
    }
    return match;
  }

  /** What the record holds now in those fields: what the agent's change is compared with. */
  public static SObject seen(Id recordId, List<Schema.SObjectField> fields) {
    SObject seen = recordId.getSObjectType().newSObject(recordId);
    if (fields.isEmpty()) {
      return seen;
    }
    List<String> names = new List<String>();
    for (Schema.SObjectField field : fields) {
      names.add(ShoreshSchema.queryName(field));
    }
    SObject now = Database.query(
      'SELECT ' +
        String.join(names, ', ') +
        ' FROM ' +
        ShoreshSchema.queryName(recordId.getSObjectType()) +
        ' WHERE Id = :recordId',
      AccessLevel.USER_MODE
    )[0];
    for (Schema.SObjectField field : fields) {
      seen.put(field, now.get(field));
    }
    return seen;
  }

  /** The days of the week as a program's fields are named, Monday first. */
  public static List<String> days() {
    return DAYS;
  }
}
