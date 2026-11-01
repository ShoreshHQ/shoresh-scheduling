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
    public AgentSetupRecords.Found found;
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
    result.found = found;
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
      String typed = text(given.get(key));
      Object value = field.getDescribe().getType() ==
        Schema.DisplayType.REFERENCE
        ? AgentSetupNames.idCalled(key, typed, result)
        : AgentSetupValues.valueOf(key, field, typed);
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

  /** A value as text; "(blank)", as read_setup_record says an empty one, is empty. */
  private static String text(Object value) {
    String said = value == null ? '' : String.valueOf(value).normalizeSpace();
    return said == '(blank)' ? '' : said;
  }

  private static String shown(Object asked, Object value) {
    return value == null ? 'left blank' : text(asked);
  }

  /**
   * What the agent saw in the fields it changes (seen: {plain name: value as read_setup_record
   * gave it}), read as the change is, for the row save to compare with what the record holds
   * now. A changed field the agent didn't say it saw is refused: Shoresh never guesses it.
   */
  public static SObject seen(Id recordId, Object seenAsked, Put changed) {
    Map<String, Object> said = given(seenAsked);
    Map<String, Schema.SObjectField> known = FIELDS.get(changed.found.term);
    Map<String, Object> asSeen = new Map<String, Object>();
    List<String> missing = new List<String>();
    for (String key : known.keySet()) {
      if (!changed.fields.contains(known.get(key))) {
        continue;
      }
      if (said.containsKey(key)) {
        asSeen.put(key, said.get(key));
      } else {
        missing.add(key);
      }
    }
    if (!missing.isEmpty()) {
      throw new ShoreshException(
        'Say what each field held when you read it (seen: ' +
          String.join(missing, ', ') +
          '), as read_setup_record gives it, so a change someone made since isn\'t overwritten.'
      );
    }
    SObject seen = recordId.getSObjectType().newSObject(recordId);
    put(seen, asSeen, changed.found);
    return seen;
  }

  /** The days of the week as a program's fields are named, Monday first. */
  public static List<String> days() {
    return DAYS;
  }
}
