/**
 * Rules Shoresh guessed are marked for a look (Greg, build log decision 45; desktop
 * `src/utils/ruleProvenance.js`, `LocationsScreen.jsx` CapacityProvenanceDot, `GroupsScreen.jsx`
 * DivisionProvenanceDot; ADR 0006 §21). What Import last year worked out from the file rather
 * than read outright is remembered for the camp, where import answers are (ImportAnswer__c), with
 * the value it saved. The setup screens mark it until the director says it looks right or
 * changes it. As on the desktop, that is:
 * - a new activity's times a week ("often") and who can do it ("who");
 * - a new place's groups that fit ("fits");
 * - a new group's division ("division"), when only its file's name gave it.
 *
 * The question key is built from names, never record Ids, as every remembered answer is:
 * "guessed|<kind>|<program, for a group>|<name>|<field>". The answer is the value saved, so a
 * change anywhere (this screen, Salesforce's record page, a list import) clears the mark, and
 * "looks right" forgets it. A guess marks only a record that was there when it was made: one
 * set up again by hand later, with the same name, is the director's (an Undo, a delete, a copied
 * season).
 */
public with sharing class SetupGuesses {
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

  /** One field of one record still as Shoresh guessed it, for the setup screens. */
  public class Guess {
    @AuraEnabled
    public Id recordId;
    @AuraEnabled
    public String field;
    /** The value guessed, where the screen says it (a group's division). */
    @AuraEnabled
    public String value;

    Guess(Id recordId, String field, String value) {
      this.recordId = recordId;
      this.field = field;
      this.value = value;
    }
  }

  // ---------- an import's save ----------

  /**
   * After an import's save (ImportSetupSaves): its plan's "guessed" entries ({ key, fields }),
   * each a record the import added. Only fields that kind of record can have guessed are kept.
   */
  public static void rememberFromPlan(
    Id campId,
    ImportPlan plan,
    ImportKeys keys
  ) {
    Map<Id, Set<String>> fieldsOf = new Map<Id, Set<String>>();
    for (ImportPlan.Entry entry : plan.entries('guessed')) {
      Id recordId = keys.of(entry.key());
      Set<String> allowed = recordId == null
        ? null
        : FIELDS_OF.get(recordId.getSObjectType());
      if (allowed == null) {
        continue;
      }
      Set<String> fields = new Set<String>(entry.texts('fields'));
      fields.retainAll(allowed);
      if (!fields.isEmpty()) {
        fieldsOf.put(recordId, fields);
      }
    }
    remember(campId, fieldsOf);
  }

  /**
   * Remembers, for the camp, that these fields of these records were guessed, with the values
   * they hold now. Four queries at most, whatever the number: activities, places, groups, then
   * the answers already there.
   */
  public static void remember(Id campId, Map<Id, Set<String>> fieldsOf) {
    Map<String, String> answerOf = new Map<String, String>();
    Set<Id> ids = fieldsOf.keySet();
    Set<Id> activityIds = idsOf(ids, Activity__c.SObjectType);
    Set<Id> locationIds = idsOf(ids, Location__c.SObjectType);
    Set<Id> groupIds = idsOf(ids, Group__c.SObjectType);
    if (!activityIds.isEmpty()) {
      for (Activity__c row : [
        SELECT
          Id,
          Name,
          TimesPerWeekMin__c,
          TimesPerWeekMax__c,
          NoWeeklyMax__c,
          (
            SELECT
              Division__r.Name,
              Division__r.Program__r.Name,
              Group__r.Name,
              Group__r.Division__r.Program__r.Name
            FROM Eligibilities__r
          )
        FROM Activity__c
        WHERE Id IN :activityIds
        WITH USER_MODE
      ]) {
        List<String> targets = new List<String>();
        for (ActivityEligibility__c canDo : row.Eligibilities__r) {
          targets.add(
            canDo.Division__c != null
              ? target(
                  canDo.Division__r.Program__r.Name,
                  canDo.Division__r.Name
                )
              : target(
                  canDo.Group__r.Division__r.Program__r.Name,
                  canDo.Group__r.Name
                )
          );
        }
        Set<String> fields = fieldsOf.get(row.Id);
        if (fields.contains(OFTEN)) {
          answerOf.put(
            questionOf('Activity', '', row.Name, OFTEN),
            oftenNow(row)
          );
        }
        if (fields.contains(WHO)) {
          answerOf.put(
            questionOf('Activity', '', row.Name, WHO),
            whoNow(targets)
          );
        }
      }
    }
    if (!locationIds.isEmpty()) {
      for (Location__c row : [
        SELECT Id, Name, GroupsThatFit__c
        FROM Location__c
        WHERE Id IN :locationIds
        WITH USER_MODE
      ]) {
        answerOf.put(
          questionOf('Location', '', row.Name, FITS),
          fitsNow(row.GroupsThatFit__c)
        );
      }
    }
    if (!groupIds.isEmpty()) {
      for (Group__c row : [
        SELECT Id, Name, Division__r.Name, Division__r.Program__r.Name
        FROM Group__c
        WHERE Id IN :groupIds
        WITH USER_MODE
      ]) {
        answerOf.put(
          questionOf(
            'Group',
            row.Division__r.Program__r.Name,
            row.Name,
            DIVISION
          ),
          row.Division__r.Name
        );
      }
    }
    ImportAnswers.rememberEach(campId, answerOf);
  }

  // ---------- the setup screens ----------

  /**
   * The fields of the season's records still as Shoresh guessed them: the value saved then is
   * the value now, and the record was there when it was guessed. One query (the camp's answers);
   * the rest comes from what the setup screen already read.
   */
  public static List<Guess> forSetup(SeasonSetupReader.SeasonSetup setup) {
    List<Guess> result = new List<Guess>();
    Map<String, ImportAnswer__c> guessed = guessesOf(setup.season.Camp__c);
    if (guessed.isEmpty()) {
      return result;
    }
    // Who can do an activity, by division or group Id: "<program>/<name>".
    Map<Id, String> targets = new Map<Id, String>();
    for (SeasonSetupReader.ProgramSetup entry : setup.programs) {
      for (SeasonSetupReader.DivisionSetup d : entry.divisions) {
        targets.put(d.division.Id, target(entry.program.Name, d.division.Name));
        for (Group__c g : d.groups) {
          targets.put(g.Id, target(entry.program.Name, g.Name));
          add(
            result,
            guessed,
            g,
            questionOf('Group', entry.program.Name, g.Name, DIVISION),
            d.division.Name,
            d.division.Name
          );
        }
      }
    }
    for (Location__c row : setup.locations) {
      add(
        result,
        guessed,
        row,
        questionOf('Location', '', row.Name, FITS),
        fitsNow(row.GroupsThatFit__c),
        null
      );
    }
    for (Activity__c row : setup.activities) {
      add(
        result,
        guessed,
        row,
        questionOf('Activity', '', row.Name, OFTEN),
        oftenNow(row),
        null
      );
      List<String> names = new List<String>();
      for (ActivityEligibility__c canDo : row.Eligibilities__r) {
        names.add(
          targets.get(
            canDo.Division__c != null ? canDo.Division__c : canDo.Group__c
          )
        );
      }
      add(
        result,
        guessed,
        row,
        questionOf('Activity', '', row.Name, WHO),
        whoNow(names),
        null
      );
    }
    return result;
  }

  /** "Looks right": the camp forgets that this field of this record was guessed. Two queries. */
  public static void confirm(Id recordId, String field) {
    Set<String> allowed = recordId == null
      ? null
      : FIELDS_OF.get(recordId.getSObjectType());
    if (allowed == null || !allowed.contains(field)) {
      throw new ShoreshException('That can\'t be marked as looked at.');
    }
    Schema.SObjectType type = recordId.getSObjectType();
    Id campId;
    String question;
    if (type == Activity__c.SObjectType) {
      for (Activity__c row : [
        SELECT Name, Season__r.Camp__c
        FROM Activity__c
        WHERE Id = :recordId
        WITH USER_MODE
      ]) {
        campId = row.Season__r.Camp__c;
        question = questionOf('Activity', '', row.Name, field);
      }
    } else if (type == Location__c.SObjectType) {
      for (Location__c row : [
        SELECT Name, Season__r.Camp__c
        FROM Location__c
        WHERE Id = :recordId
        WITH USER_MODE
      ]) {
        campId = row.Season__r.Camp__c;
        question = questionOf('Location', '', row.Name, field);
      }
    } else {
      for (Group__c row : [
        SELECT
          Name,
          Division__r.Program__r.Name,
          Division__r.Program__r.Season__r.Camp__c
        FROM Group__c
        WHERE Id = :recordId
        WITH USER_MODE
      ]) {
        campId = row.Division__r.Program__r.Season__r.Camp__c;
        question = questionOf(
          'Group',
          row.Division__r.Program__r.Name,
          row.Name,
          field
        );
      }
    }
    if (campId == null) {
      throw new ShoreshException(
        'That was not found. It may have been deleted.'
      );
    }
    ImportAnswers.forget(campId, new Set<String>{ question });
  }

  // ---------- keys and values ----------

  public static String questionOf(
    String kind,
    String scope,
    String name,
    String field
  ) {
    return PREFIX +
      kind +
      '|' +
      (scope == null ? '' : scope) +
      '|' +
      name +
      '|' +
      field;
  }

  /** Times a week as saved: "2-3", "2-" (no most set), "2-none" (no weekly maximum). */
  @TestVisible
  private static String oftenNow(Activity__c row) {
    return wholeText(row.TimesPerWeekMin__c) +
      '-' +
      (row.NoWeeklyMax__c ? 'none' : wholeText(row.TimesPerWeekMax__c));
  }

  /** Who can do it: "everyone", or each division and group by program and name, in order. */
  @TestVisible
  private static String whoNow(List<String> targets) {
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

  private static String fitsNow(Decimal value) {
    return wholeText(value);
  }

  private static String target(String program, String name) {
    return ((program == null ? '' : program) +
      '/' +
      (name == null ? '' : name))
      .toLowerCase();
  }

  private static String wholeText(Decimal value) {
    return value == null ? '' : String.valueOf(value.intValue());
  }

  private static Set<Id> idsOf(Set<Id> ids, Schema.SObjectType type) {
    Set<Id> result = new Set<Id>();
    for (Id recordId : ids) {
      if (recordId.getSObjectType() == type) {
        result.add(recordId);
      }
    }
    return result;
  }

  /** The camp's remembered guesses, by question. */
  private static Map<String, ImportAnswer__c> guessesOf(Id campId) {
    Map<String, ImportAnswer__c> result = new Map<String, ImportAnswer__c>();
    for (ImportAnswer__c row : [
      SELECT QuestionKey__c, Answer__c, LastModifiedDate
      FROM ImportAnswer__c
      WHERE Camp__c = :campId
      WITH USER_MODE
      ORDER BY CreatedDate
      LIMIT 5000
    ]) {
      if (row.QuestionKey__c != null && row.QuestionKey__c.startsWith(PREFIX)) {
        result.put(row.QuestionKey__c, row);
      }
    }
    return result;
  }

  /** A guess still standing: the same value, on a record there when it was guessed. */
  private static void add(
    List<Guess> result,
    Map<String, ImportAnswer__c> guessed,
    SObject record,
    String question,
    String now,
    String value
  ) {
    ImportAnswer__c row = guessed.get(question);
    if (
      row == null ||
      !now.equals(row.Answer__c) ||
      (Datetime) record.get('CreatedDate') > row.LastModifiedDate
    ) {
      return;
    }
    String field = question.substringAfterLast('|');
    result.add(new Guess(record.Id, field, value));
  }
}
