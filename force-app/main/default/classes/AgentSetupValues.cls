/**
 * A setup field's value as a camp types it (docs/protocol/api.md API-1.49): yes or no, a date like
 * 2026-07-06, a time like 9:00 AM, a number, or one of a picklist's choices by its label. A value
 * that doesn't read is refused saying how to give it.
 */
public with sharing class AgentSetupValues {
  private static final Set<String> YES = new Set<String>{
    'yes',
    'true',
    'y',
    'on'
  };
  private static final Set<String> NO = new Set<String>{
    'no',
    'false',
    'n',
    'off'
  };

  /** One value as the table's field takes it; blank clears it (a tick needs yes or no). */
  public static Object valueOf(
    String key,
    Schema.SObjectField field,
    String asked
  ) {
    Schema.DescribeFieldResult about = field.getDescribe();
    Schema.DisplayType type = about.getType();
    if (type == Schema.DisplayType.BOOLEAN) {
      return tick(key, asked);
    }
    if (String.isBlank(asked)) {
      return null;
    }
    if (type == Schema.DisplayType.DATE) {
      return dateOf(key, asked);
    }
    if (type == Schema.DisplayType.TIME) {
      return AgentSetupTimes.timeOf(key, asked);
    }
    if (
      type == Schema.DisplayType.DOUBLE ||
      type == Schema.DisplayType.INTEGER
    ) {
      return numberOf(key, asked);
    }
    if (type == Schema.DisplayType.PICKLIST) {
      return choiceOf(key, about, asked);
    }
    return asked;
  }

  private static String words(String key) {
    return key.replace('_', ' ');
  }

  private static Boolean tick(String key, String asked) {
    String said = asked.toLowerCase();
    if (YES.contains(said)) {
      return true;
    }
    if (NO.contains(said)) {
      return false;
    }
    throw new ShoreshException(
      'Say yes or no for ' + words(key) + ' (' + key + ').'
    );
  }

  private static Date dateOf(String key, String asked) {
    try {
      return Date.valueOf(asked);
    } catch (Exception e) {
      throw new ShoreshException(
        'Give the ' + words(key) + ' as a date like 2026-07-06.'
      );
    }
  }

  /** The screens' number boxes take whole numbers, none below zero. */
  private static Decimal numberOf(String key, String asked) {
    if (!asked.isNumeric()) {
      throw new ShoreshException(
        'Give the ' + words(key) + ' as a whole number, like 2.'
      );
    }
    return Decimal.valueOf(asked);
  }

  private static String choiceOf(
    String key,
    Schema.DescribeFieldResult about,
    String asked
  ) {
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
      'The ' + words(key) + ' is one of: ' + String.join(labels, ', ') + '.'
    );
  }
}
