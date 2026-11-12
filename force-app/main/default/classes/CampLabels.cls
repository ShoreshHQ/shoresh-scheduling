/**
 * A camp's own words for the model terms in the glossary (decision 0006).
 * Missing labels fall back to the model term. Used by Shoresh screens and by every message
 * Shoresh shows, so a camp that says "Bunk" never sees "Group" from Shoresh.
 */
public with sharing class CampLabels {
  private static final Set<String> SAME_IN_PLURAL = new Set<String>{
    'Availability',
    'Groups at once',
    'Groups that fit',
    'Minimum to run',
    'Times per week'
  };
  /**
   * Words no screen shows (word walk W1): left off Camp words, its worksheet and the AI's
   * read_camp_words. Their picklist values stay, so singular('Conflict') still answers.
   */
  public static final Set<String> UNSHOWN = new Set<String>{
    'Scheduler',
    'WeekException',
    'Preference',
    'Assignment',
    'DraftSchedule',
    'Placement',
    'Conflict',
    'Shortfall',
    'Lock',
    'Team'
  };
  // This camp's own words, by model term.
  private final Map<String, CampLabel__c> custom = new Map<String, CampLabel__c>();
  // Model term (picklist API name) => [singular, plural], in glossary order.
  private static final Map<String, List<String>> MODEL_TERMS = new Map<String, List<String>>();

  static {
    for (
      Schema.PicklistEntry entry : CampLabel__c.ModelTerm__c.getDescribe()
        .getPicklistValues()
    ) {
      MODEL_TERMS.put(
        entry.getValue(),
        new List<String>{ entry.getLabel(), pluralOf(entry.getLabel()) }
      );
    }
  }

  private CampLabels(List<CampLabel__c> labels) {
    for (CampLabel__c label : labels) {
      custom.put(label.ModelTerm__c, label);
    }
  }

  public static CampLabels forCamp(Id campId) {
    return forCamps(new Set<Id>{ campId }).get(campId);
  }

  public static Map<Id, CampLabels> forCamps(Set<Id> campIds) {
    Map<Id, List<CampLabel__c>> byCamp = new Map<Id, List<CampLabel__c>>();
    for (Id campId : campIds) {
      byCamp.put(campId, new List<CampLabel__c>());
    }
    // Without access to camp labels the model terms are shown, never an error.
    if (Schema.sObjectType.CampLabel__c.isAccessible()) {
      for (CampLabel__c label : [
        SELECT Id, Camp__c, ModelTerm__c, Singular__c, Plural__c
        FROM CampLabel__c
        WHERE Camp__c IN :campIds
        WITH USER_MODE
      ]) {
        byCamp.get(label.Camp__c).add(label);
      }
    }
    Map<Id, CampLabels> result = new Map<Id, CampLabels>();
    for (Id campId : byCamp.keySet()) {
      result.put(campId, new CampLabels(byCamp.get(campId)));
    }
    return result;
  }

  /** For messages about records whose camp is not known yet. */
  public static CampLabels modelTermsOnly() {
    return new CampLabels(new List<CampLabel__c>());
  }

  /** The term at the start of a sentence or as a heading: "Group", or the camp's "Bunk". */
  public String singular(String term) {
    CampLabel__c label = custom.get(term);
    if (label != null) {
      return label.Singular__c;
    }
    List<String> follows = followed(term);
    return follows != null ? follows[0] : MODEL_TERMS.get(term)[0];
  }

  public String plural(String term) {
    CampLabel__c label = custom.get(term);
    if (label != null) {
      return label.Plural__c;
    }
    List<String> follows = followed(term);
    return follows != null ? follows[1] : MODEL_TERMS.get(term)[1];
  }

  /** The term inside a sentence: model terms in lower case, camp labels exactly as the camp typed them. */
  public String singularInSentence(String term) {
    return isCampWord(term) ? singular(term) : singular(term).toLowerCase();
  }

  public String pluralInSentence(String term) {
    return isCampWord(term) ? plural(term) : plural(term).toLowerCase();
  }

  /** The camp typed this word, or it follows one the camp typed. */
  private Boolean isCampWord(String term) {
    return custom.containsKey(term) || followed(term) != null;
  }

  /**
   * CORE-1.34: a word the camp left standard that follows a word it set: Elective set is the
   * camp's Elective words ("Chug" / "Chugim"); Groups that fit and Groups at once are its Group
   * plural ("Bunks that fit"). Null when the camp set this word itself, or the word it follows
   * is standard.
   */
  private List<String> followed(String term) {
    if (custom.containsKey(term)) {
      return null;
    }
    if (term == 'ElectiveSet' && custom.containsKey('Elective')) {
      CampLabel__c elective = custom.get('Elective');
      return new List<String>{ elective.Singular__c, elective.Plural__c };
    }
    Boolean ofGroups = term == 'GroupsThatFit' || term == 'GroupsAtOnce';
    if (ofGroups && custom.containsKey('Group')) {
      String word =
        custom.get('Group').Plural__c +
        (term == 'GroupsThatFit' ? ' that fit' : ' at once');
      return new List<String>{ word, word };
    }
    return null;
  }

  /** Every model term with this camp's label, for the screens and the label editor. */
  public List<TermLabel> all() {
    List<TermLabel> result = new List<TermLabel>();
    for (String term : MODEL_TERMS.keySet()) {
      TermLabel row = new TermLabel();
      row.term = term;
      row.modelSingular = MODEL_TERMS.get(term)[0];
      row.modelPlural = MODEL_TERMS.get(term)[1];
      row.singular = singular(term);
      row.plural = plural(term);
      row.isCustom = custom.containsKey(term);
      row.labelId = row.isCustom ? custom.get(term).Id : null;
      result.add(row);
    }
    return result;
  }

  /**
   * Why this person cannot change a camp's labels, or null when they can. Anyone with the
   * Shoresh Scheduler permission set can (Greg, 2026-10-15), unless an admin has narrowed
   * access to camp records. Short, in the desktop's words ("Only an admin can ...", e.g.
   * TiersScreen.jsx); no Salesforce machinery named.
   */
  public static String whyCannotEdit(Id campId) {
    Schema.DescribeSObjectResult labels = Schema.sObjectType.CampLabel__c;
    if (
      !labels.isCreateable() ||
      !labels.isUpdateable() ||
      !labels.isDeletable()
    ) {
      return 'Only an admin can change camp words.';
    }
    List<UserRecordAccess> access = [
      SELECT RecordId, HasEditAccess
      FROM UserRecordAccess
      WHERE UserId = :UserInfo.getUserId() AND RecordId = :campId
      WITH SYSTEM_MODE
    ];
    if (access.isEmpty() || !access[0].HasEditAccess) {
      return 'You can\'t edit this camp, so its words are view only.';
    }
    return null;
  }

  /**
   * Saves a camp's words from the label editor, all or none. A term with both words blank,
   * or with exactly the model term's words, goes back to the model term.
   */
  public static void save(Id campId, List<TermLabel> rows) {
    CampLabelIds.refuseOthers(campId, rows);
    List<CampLabel__c> toSave = new List<CampLabel__c>();
    List<Id> toDelete = new List<Id>();
    for (TermLabel row : rows) {
      CampLabel__c label = row.toRecord(campId);
      if (label != null) {
        toSave.add(label);
      } else if (row.labelId != null) {
        toDelete.add(row.labelId);
      }
    }
    Savepoint beforeSave = Database.setSavepoint();
    try {
      Database.delete(toDelete, true, AccessLevel.USER_MODE);
      UserModeWrites.save(toSave);
    } catch (DmlException e) {
      Database.rollback(beforeSave);
      throw e;
    }
  }

  /**
   * The English plural of a standard word, the one rule the screens use too (shoreshTerms
   * guessPlural): "ies" after a consonant and y, "es" after s, x, z, ch and sh, else "s".
   */
  @TestVisible
  private static String pluralOf(String singular) {
    if (SAME_IN_PLURAL.contains(singular)) {
      return singular;
    }
    String lower = singular.toLowerCase();
    if (lower.endsWith('y') && !Pattern.matches('.*[aeiou]y', lower)) {
      return singular.removeEnd('y') + 'ies';
    }
    if (Pattern.matches('.*(s|x|z|ch|sh)', lower)) {
      return singular + 'es';
    }
    return singular + 's';
  }

  // Properties, not plain fields: Salesforce only fills in properties when a screen sends
  // these back to the server.
  public class TermLabel {
    @AuraEnabled
    public String term { get; set; }
    @AuraEnabled
    public String modelSingular { get; set; }
    @AuraEnabled
    public String modelPlural { get; set; }
    @AuraEnabled
    public String singular { get; set; }
    @AuraEnabled
    public String plural { get; set; }
    // apex-aura-inputs-ok: shown to the screen only; never read back.
    @AuraEnabled
    public Boolean isCustom;
    @AuraEnabled
    public Id labelId { get; set; }

    private String cleaned(String word) {
      return String.isBlank(word) ? '' : word.trim();
    }

    /** The record to save, or null when this term should show the model term. */
    CampLabel__c toRecord(Id campId) {
      String one = cleaned(singular);
      String many = cleaned(plural);
      if (
        one + many == '' ||
        (one + '/' + many ==
        modelSingular + '/' + modelPlural)
      ) {
        return null;
      }
      if (one == '' || many == '') {
        throw new LabelException(
          'Give "' +
            modelSingular +
            '" both a singular and a plural word, or clear both.'
        );
      }
      CampLabel__c label = new CampLabel__c(
        Id = labelId,
        Singular__c = one,
        Plural__c = many
      );
      if (labelId == null) {
        label.Camp__c = campId;
        label.ModelTerm__c = term;
      }
      return label;
    }
  }

  public class LabelException extends ShoreshException {
  }
}
