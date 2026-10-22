/**
 * Keys and values for what an import guessed (SetupGuesses, ADR 0006 §21). A key names the
 * season by its Id, so a guess in one season never marks, or is cleared by, another season of the
 * camp, and the rest by names: "guessed|<season Id>|<kind>|<program, for a group>|<name>|<field>".
 * A value is what the field holds, written the same way when the import saves it and when a setup
 * screen reads it, so a change anywhere shows as a different value.
 */
public with sharing class SetupGuessValues {
  public static final String PREFIX = 'guessed|';
  public static final String OFTEN = 'often';
  public static final String WHO = 'who';
  public static final String FITS = 'fits';
  public static final String DIVISION = 'division';
  // A who list longer than an answer holds is kept as its digest.
  private static final Integer ANSWER_ROOM = 255;
  // The fields an import can guess, by kind.
  private static final Map<Schema.SObjectType, Set<String>> FIELDS_OF = new Map<Schema.SObjectType, Set<String>>{
    Activity__c.SObjectType => new Set<String>{ OFTEN, WHO },
    Location__c.SObjectType => new Set<String>{ FITS },
    Group__c.SObjectType => new Set<String>{ DIVISION }
  };

  /** The fields this record's kind can have guessed; empty for any other kind. */
  public static Set<String> fieldsFor(Id recordId) {
    Set<String> fields = recordId == null
      ? null
      : FIELDS_OF.get(recordId.getSObjectType());
    return fields == null ? new Set<String>() : fields;
  }

  /** An activity or place a key names: "guessed|<season Id>|<kind>||<name>". */
  public static String item(Id seasonId, String kind, String name) {
    return PREFIX + seasonId + '|' + kind + '||' + name;
  }

  /** A group a key names, by its program: "guessed|<season Id>|Group|<program>|<name>". */
  public static String bunk(Id seasonId, String program, String name) {
    return PREFIX +
      seasonId +
      '|Group|' +
      (program == null ? '' : program) +
      '|' +
      name;
  }

  /** One field of an item. */
  public static String question(String item, String field) {
    return item + '|' + field;
  }

  /** Times a week as saved: "2-3", "2-" (no most set), "2-none" (no weekly maximum). */
  public static String often(Activity__c row) {
    return wholeText(row.TimesPerWeekMin__c) +
      '-' +
      (row.NoWeeklyMax__c ? 'none' : wholeText(row.TimesPerWeekMax__c));
  }

  /** Who can do it: "everyone", or each division and group by program and name, in order. */
  public static String who(List<String> targets) {
    if (targets.isEmpty()) {
      return 'everyone';
    }
    List<String> sorted = new List<String>(targets);
    sorted.sort();
    String joined = String.join(sorted, '|');
    return joined.length() <= ANSWER_ROOM
      ? joined
      : 'sha256:' +
        EncodingUtil.convertToHex(
          Crypto.generateDigest('SHA-256', Blob.valueOf(joined))
        );
  }

  /** A division or group in a who list: "<program>/<name>", lower case. */
  public static String target(String program, String name) {
    return ((program == null ? '' : program) +
      '/' +
      (name == null ? '' : name))
      .toLowerCase();
  }

  public static String wholeText(Decimal value) {
    return value == null ? '' : String.valueOf(value.intValue());
  }
}
