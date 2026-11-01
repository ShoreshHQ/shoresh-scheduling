/**
 * An activity's details panel through a person's AI (docs/protocol/api.md API-1.51): who can do
 * it, groups from the same division only, early in the week, and notes, by plain names, said as
 * the panel shows them and read back as seen. A change is the panel's own save
 * (ActivitiesController.saveActivityDetails), made only while each field it changes still holds
 * what the AI read; otherwise refused with nothing saved.
 */
public with sharing class AgentActivityRules {
  public static final String WHO = 'who_can_do_it';
  private static final String EVERYONE = 'everyone';

  // The panel's rules, in its order (who can do it comes first).
  private static final Map<String, Schema.SObjectField> PANEL_RULES = new Map<String, Schema.SObjectField>{
    'same_division_only' => Activity__c.SameDivisionOnly__c,
    'early_week_count' => Activity__c.EarlyWeekCount__c,
    'early_week_by_day' => Activity__c.EarlyWeekByDay__c,
    'notes' => Activity__c.Notes__c
  };

  /** The panel's fields by plain name, in its order. */
  public static List<String> names() {
    List<String> result = new List<String>{ WHO };
    result.addAll(PANEL_RULES.keySet());
    return result;
  }

  /** What the activity holds now, by plain name, as the panel shows it (locked when asked). */
  public static Map<String, String> now(Id activityId, Boolean lock) {
    Activity__c activity = lock
      ? [
          SELECT
            SameDivisionOnly__c,
            EarlyWeekCount__c,
            EarlyWeekByDay__c,
            Notes__c
          FROM Activity__c
          WHERE Id = :activityId
          WITH USER_MODE
          FOR UPDATE
        ]
      : [
          SELECT
            SameDivisionOnly__c,
            EarlyWeekCount__c,
            EarlyWeekByDay__c,
            Notes__c
          FROM Activity__c
          WHERE Id = :activityId
          WITH USER_MODE
        ];
    Map<String, String> result = new Map<String, String>{
      WHO => whoSaid(whoNames(activityId))
    };
    for (String key : PANEL_RULES.keySet()) {
      result.put(key, shown(activity.get(PANEL_RULES.get(key))));
    }
    return result;
  }

  /** One value as the panel shows it: yes or no, (blank), notes on one line. */
  private static String shown(Object value) {
    if (value instanceof Boolean) {
      return value == true ? 'yes' : 'no';
    }
    if (value == null || String.valueOf(value) == '') {
      return '(blank)';
    }
    return String.valueOf(value).normalizeSpace();
  }

  /** Who can do it now: the divisions' and groups' names. */
  private static List<String> whoNames(Id activityId) {
    List<String> names = new List<String>();
    for (ActivityEligibility__c row : [
      SELECT Division__r.Name, Group__r.Name
      FROM ActivityEligibility__c
      WHERE Activity__c = :activityId
      WITH USER_MODE
    ]) {
      names.add(
        row.Division__r != null ? row.Division__r.Name : row.Group__r.Name
      );
    }
    return names;
  }

  /** Who, said one way whatever the order: names A to Z, or everyone (none means everyone). */
  private static String whoSaid(List<String> names) {
    List<String> sorted = new List<String>();
    for (String name : names) {
      if (String.isNotBlank(name)) {
        sorted.add(name.normalizeSpace());
      }
    }
    if (sorted.isEmpty()) {
      return EVERYONE;
    }
    sorted.sort();
    return String.join(sorted, ', ');
  }

  /** Seen as the panel shows it: who sorted, notes on one line, a tick or number as read. */
  private static String canonical(String key, Object said) {
    String text = said == null ? '' : String.valueOf(said).normalizeSpace();
    if (key == WHO) {
      return IncomingBatch.fold(text) == EVERYONE
        ? EVERYONE
        : whoSaid(text.split(','));
    }
    if (text == '(blank)' || text == '') {
      return '(blank)';
    }
    Schema.SObjectField field = PANEL_RULES.get(key);
    if (field.getDescribe().getType() != Schema.DisplayType.TEXTAREA) {
      // yes/Yes, Monday/monday: read as the change reads them, then said as the panel does.
      return shown(AgentSetupValues.valueOf(key, field, text));
    }
    return text;
  }

  /**
   * Saves the fields asked (fields: {plain name: value}) as the panel does, unless one of them no
   * longer holds what was seen. Answers what was changed.
   */
  public static String change(
    AgentSetupRecords.Found found,
    Object asked,
    Object seenAsked
  ) {
    Map<String, Object> given = AgentSetupFields.given(asked);
    List<String> known = names();
    for (String key : given.keySet()) {
      if (!known.contains(key)) {
        throw new ShoreshException(
          'The details have no field "' +
            key.left(40) +
            '". Its fields: ' +
            String.join(known, ', ') +
            '.'
        );
      }
    }
    if (given.isEmpty()) {
      throw new ShoreshException(
        'Say what to change (fields). Its fields: ' +
          String.join(known, ', ') +
          '.'
      );
    }
    Map<String, Object> seen = AgentSetupFields.given(seenAsked);
    List<String> missing = new List<String>();
    for (String key : known) {
      if (given.containsKey(key) && !seen.containsKey(key)) {
        missing.add(key);
      }
    }
    if (!missing.isEmpty()) {
      throw new ShoreshException(
        'Say what each field held when you read it (seen: ' +
          String.join(missing, ', ') +
          '), as read_activity_rules gives it, so a change someone made since isn\'t overwritten.'
      );
    }
    // Read the asked values first: one that doesn't read is refused before anything is locked.
    Activity__c rules = new Activity__c(Id = found.id);
    List<String> said = new List<String>();
    List<Id> chosen = null;
    for (String key : known) {
      if (!given.containsKey(key)) {
        continue;
      }
      String text = given.get(key) == null
        ? ''
        : String.valueOf(given.get(key)).trim();
      if (key == WHO) {
        chosen = whoIds(text, found);
        said.add('who can do it ' + (chosen.isEmpty() ? EVERYONE : text));
        continue;
      }
      Schema.SObjectField field = PANEL_RULES.get(key);
      Object value = text == '(blank)'
        ? null
        : AgentSetupValues.valueOf(key, field, text);
      if (key == 'early_week_count' && value != null && (Decimal) value < 1) {
        throw new ShoreshException(
          'Give the early week count as a whole number, 1 or more.'
        );
      }
      rules.put(field, value);
      said.add(
        key.replace('_', ' ') +
          ' ' +
          (value == null ? 'left blank' : text.normalizeSpace())
      );
    }
    Map<String, String> now = now(found.id, true);
    for (String key : known) {
      if (
        given.containsKey(key) &&
        !canonical(key, seen.get(key)).equals(now.get(key))
      ) {
        throw new AgentWeeks.ConflictException(
          'Someone else changed "' +
            found.name +
            '" since, so nothing was saved. Read it again in Shoresh.'
        );
      }
    }
    if (chosen == null) {
      chosen = whoIdsNow(found.id);
    }
    try {
      // The activity details panel's own save.
      ActivitiesController.saveActivityDetails(rules, chosen);
    } catch (Exception e) {
      throw new ShoreshException(
        '"' + found.name + '" not saved. ' + ScreenErrors.words(e)
      );
    }
    return 'Changed the ' +
      found.kind +
      ' "' +
      found.name +
      '": ' +
      String.join(said, ', ') +
      '.';
  }

  private static List<Id> whoIdsNow(Id activityId) {
    List<Id> ids = new List<Id>();
    for (ActivityEligibility__c row : [
      SELECT Division__c, Group__c
      FROM ActivityEligibility__c
      WHERE Activity__c = :activityId
      WITH USER_MODE
    ]) {
      ids.add(row.Division__c != null ? row.Division__c : row.Group__c);
    }
    return ids;
  }

  /**
   * The divisions and groups named (comma between), as the panel's ticks offer them; everyone or
   * blank is none (everyone). A name not there, or one two of them share, is refused.
   */
  private static List<Id> whoIds(String asked, AgentSetupRecords.Found found) {
    List<Id> ids = new List<Id>();
    if (String.isBlank(asked) || IncomingBatch.fold(asked.trim()) == EVERYONE) {
      return ids;
    }
    Id seasonId = found.seasonId;
    List<SObject> offered = new List<SObject>();
    offered.addAll(
      [
        SELECT Id, Name
        FROM Division__c
        WHERE Program__r.Season__c = :seasonId AND NoDivision__c = FALSE
        WITH USER_MODE
        ORDER BY SortOrder__c, Name
      ]
    );
    offered.addAll(
      [
        SELECT Id, Name
        FROM Group__c
        WHERE Division__r.Program__r.Season__c = :seasonId
        WITH USER_MODE
        ORDER BY SortOrder__c, Name
      ]
    );
    List<String> names = new List<String>();
    for (SObject row : offered) {
      names.add((String) row.get('Name'));
    }
    for (String name : asked.split(',')) {
      if (String.isBlank(name)) {
        continue;
      }
      List<Integer> at = new List<Integer>();
      for (Integer i = 0; i < names.size(); i++) {
        if (IncomingBatch.fold(names[i]) == IncomingBatch.fold(name.trim())) {
          at.add(i);
        }
      }
      if (at.size() > 1) {
        throw new ShoreshException(
          'More than one is called "' +
            name.trim().left(80) +
            '", so Shoresh can\'t tell which you mean. Rename one in Shoresh, then ask again.'
        );
      }
      if (at.isEmpty()) {
        throw new ShoreshException(
          'There is no ' +
            found.labels.singularInSentence('Division') +
            ' or ' +
            found.labels.singularInSentence('Group') +
            ' called "' +
            name.trim().left(80) +
            '" that this user can see. ' +
            AgentWeeks.namesSaid(
              found.labels.pluralInSentence('Division') +
                ' and ' +
                found.labels.pluralInSentence('Group'),
              names
            )
        );
      }
      ids.add(offered[at[0]].Id);
    }
    return ids;
  }
}
