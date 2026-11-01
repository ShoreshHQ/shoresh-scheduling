/**
 * change_activity_rules: change an activity's details (who can do it, same division only, early
 * in the week, notes), as the person, through an agent or the command line (docs/protocol/api.md
 * API-1.51). Web address /v1/change_activity_rules, POST {season, name, fields, seen}. It is the
 * activity details panel's own save (ActivitiesController.saveActivityDetails), made only while
 * each field changed still holds what read_activity_rules said (seen); someone else's change since
 * is refused (409) with nothing saved.
 */
@RestResource(urlMapping='/v1/change_activity_rules')
global with sharing class AgentChangeActivityRules implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'name',
    'fields',
    'seen'
  };

  private AgentSetupRecords.Found found;
  private Map<String, Object> given;
  private Activity__c rules;
  private List<Id> chosen;
  private List<String> said = new List<String>();

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentChangeActivityRules());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    body.put('kind', 'Activity');
    found = AgentSetupRecords.find(body);
    given = AgentSetupFields.given(body.get('fields'));
    refuseUnknown();
    Map<String, Object> seen = AgentSetupFields.given(body.get('seen'));
    refuseUnseen(seen);
    // Read the asked values first: one that doesn't read is refused before anything is locked.
    readAsked();
    AgentActivityRules.lock(found.id);
    refuseIfChangedSince(seen);
    if (chosen == null) {
      chosen = AgentActivityWho.idsNow(found.id);
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

  private void refuseUnknown() {
    List<String> known = AgentActivityRules.names();
    String asked = given.isEmpty() ? null : unknownIn(known);
    if (given.isEmpty() || asked != null) {
      throw new ShoreshException(
        (asked == null
            ? 'Say what to change (fields).'
            : 'The details have no field "' + asked.left(40) + '".') +
          ' Its fields: ' +
          String.join(known, ', ') +
          '.'
      );
    }
  }

  private String unknownIn(List<String> known) {
    for (String key : given.keySet()) {
      if (!known.contains(key)) {
        return key;
      }
    }
    return null;
  }

  /** Each changed field needs what was seen in it: Shoresh never reads it in its place. */
  private void refuseUnseen(Map<String, Object> seen) {
    List<String> missing = new List<String>();
    for (String key : AgentActivityRules.names()) {
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
  }

  /** The values asked, as the panel's save takes them, in the panel's order. */
  private void readAsked() {
    rules = new Activity__c(Id = found.id);
    for (String key : AgentActivityRules.names()) {
      if (!given.containsKey(key)) {
        continue;
      }
      String text = given.get(key) == null
        ? ''
        : String.valueOf(given.get(key)).trim();
      if (key == AgentActivityRules.WHO) {
        chosen = AgentActivityWho.idsOf(text, found);
        said.add(
          'who can do it ' +
          (chosen.isEmpty() ? AgentActivityWho.EVERYONE : text)
        );
      } else {
        Object value = valueOf(key, text);
        rules.put(AgentActivityRules.fieldOf(key), value);
        said.add(
          key.replace('_', ' ') +
            ' ' +
            (value == null ? 'left blank' : text.normalizeSpace())
        );
      }
    }
  }

  /** One rule's value; the early week count, as the panel's box, is 1 or more. */
  private static Object valueOf(String key, String text) {
    Object value = text == '(blank)'
      ? null
      : AgentSetupValues.valueOf(key, AgentActivityRules.fieldOf(key), text);
    if (key == 'early_week_count' && value != null && (Decimal) value < 1) {
      throw new ShoreshException(
        'Give the early week count as a whole number, 1 or more.'
      );
    }
    return value;
  }

  /** Each changed field compared with what it holds now, as the panel shows it. */
  private void refuseIfChangedSince(Map<String, Object> seen) {
    Map<String, String> now = AgentActivityRules.now(found.id);
    for (String key : given.keySet()) {
      if (
        !AgentActivityRules.asShown(key, seen.get(key)).equals(now.get(key))
      ) {
        throw new AgentWeeks.ConflictException(
          'Someone else changed "' +
            found.name +
            '" since, so nothing was saved. Read it again in Shoresh.'
        );
      }
    }
  }
}
