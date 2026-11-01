/**
 * An activity's details panel through a person's AI (docs/protocol/api.md API-1.51): who can do
 * it, groups from the same division only, early in the week, and notes, by plain names, said as
 * the panel shows them so the AI can send them back as seen (change_activity_rules).
 */
public with sharing class AgentActivityRules {
  public static final String WHO = 'who_can_do_it';

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

  /** One of the panel's rules by plain name (null for who can do it, or one it hasn't). */
  public static Schema.SObjectField fieldOf(String key) {
    return PANEL_RULES.get(key);
  }

  /** Holds the activity until the request ends, so no one changes it between compare and save. */
  public static void lock(Id activityId) {
    List<Activity__c> held = [
      SELECT Id
      FROM Activity__c
      WHERE Id = :activityId
      WITH USER_MODE
      FOR UPDATE
    ];
    if (held.isEmpty()) {
      throw new ShoreshException(
        'That was not found, or you do not have access to it.'
      );
    }
  }

  /** What the activity holds now, by plain name, as the panel shows it. */
  public static Map<String, String> now(Id activityId) {
    Activity__c activity = [
      SELECT SameDivisionOnly__c, EarlyWeekCount__c, EarlyWeekByDay__c, Notes__c
      FROM Activity__c
      WHERE Id = :activityId
      WITH USER_MODE
    ];
    Map<String, String> result = new Map<String, String>{
      WHO => AgentActivityWho.said(AgentActivityWho.namesNow(activityId))
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

  /** What was seen, said as the panel shows it: who as a list A to Z, notes on one line, a tick as read. */
  public static String asShown(String key, Object said) {
    if (key == WHO) {
      return AgentActivityWho.said(AgentActivityWho.namesIn(said));
    }
    String text = said == null ? '' : String.valueOf(said).normalizeSpace();
    if (text == '(blank)' || text == '') {
      return '(blank)';
    }
    Schema.SObjectField field = PANEL_RULES.get(key);
    if (field.getDescribe().getType() == Schema.DisplayType.TEXTAREA) {
      return text;
    }
    // yes/Yes, Monday/monday: read as the change reads them, then said as the panel does.
    return shown(AgentSetupValues.valueOf(key, field, text));
  }
}
