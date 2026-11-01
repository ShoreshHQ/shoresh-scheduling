/**
 * Two things a setup change reads as Camp Setup's table does (docs/protocol/api.md API-1.49,
 * API-1.50): notes are said and compared on one line, so a note with line breaks read back
 * unchanged is what was seen; and a location takes at least one group, as the table's box does.
 */
public with sharing class AgentSetupNotes {
  /**
   * A text field seen that reads the same as it holds now, on one line, is seen as it holds it
   * (line breaks and all), so the row save doesn't take it as changed.
   */
  public static void seenAsTyped(
    SObject seen,
    List<Schema.SObjectField> changed
  ) {
    List<Schema.SObjectField> notes = textIn(changed);
    if (notes.isEmpty()) {
      return;
    }
    List<String> columns = new List<String>();
    for (Schema.SObjectField field : notes) {
      columns.add(ShoreshSchema.queryName(field));
    }
    SObject now = Database.queryWithBinds(
      'SELECT ' +
        String.join(columns, ', ') +
        ' FROM ' +
        ShoreshSchema.queryName(seen.getSObjectType()) +
        ' WHERE Id = :recordId',
      new Map<String, Object>{ 'recordId' => seen.Id },
      AccessLevel.USER_MODE
    )[0];
    for (Schema.SObjectField field : notes) {
      if (oneLine(now.get(field)).equals(oneLine(seen.get(field)))) {
        seen.put(field, now.get(field));
      }
    }
  }

  private static List<Schema.SObjectField> textIn(
    List<Schema.SObjectField> fields
  ) {
    Set<Schema.DisplayType> text = new Set<Schema.DisplayType>{
      Schema.DisplayType.TEXTAREA,
      Schema.DisplayType.STRING
    };
    List<Schema.SObjectField> result = new List<Schema.SObjectField>();
    for (Schema.SObjectField field : fields) {
      if (text.contains(field.getDescribe().getType())) {
        result.add(field);
      }
    }
    return result;
  }

  private static String oneLine(Object value) {
    return value == null ? '' : String.valueOf(value).normalizeSpace();
  }

  /** A location takes at least one group, as the screen's box does (min 1). */
  public static void refuseTooFewGroups(SObject record) {
    Object fit = record instanceof Location__c
      ? record.get(Location__c.GroupsThatFit__c)
      : null;
    if (fit != null && (Decimal) fit < 1) {
      throw new ShoreshException(
        'Give the groups that fit as a whole number, 1 or more.'
      );
    }
  }
}
