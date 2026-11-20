/**
 * Import a list, Import worksheet and Import last year through an agent or the command line
 * (docs/protocol/api.md API-1.80, API-1.81, API-1.84). The files are read where the screen reads
 * them, outside Salesforce (the connector runs the screen's own modules, c/shoreshLists and
 * c/shoreshImport flow.js), so each web address has two halves:
 *   GET  ?season=  what the screen reads: the season's setup (SeasonSetupController.
 *        getSeasonSetupInCamp, the camp's words in it), the camp's remembered answers
 *        (ImportController.getAnswers), and the setup's stamp as read (seen)
 *   POST {season, seen, plan}  the screen's own save (ImportController.saveList or saveWorkbook),
 *        made only while the season's setup still has the stamp seen, compared with the season
 *        locked as imports and Undos lock it (ImportUndo.lockSeason)
 */
public with sharing class AgentImports {
  /** Import last year: it also reads what earlier imports brought in, and saves weeks' versions. */
  public static final String LAST_YEAR = 'lastYear';
  public static final String SCREEN_LIST = 'list';
  /** Import choices (API-1.117): it also reads the Elective seats screen's own sets and runs. */
  public static final String CHOICES = 'choices';
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'seen',
    'plan'
  };

  /** The GET: what the screen reads before a file, for one door. */
  public with sharing virtual class Reads implements AgentRequest.Read {
    private String door;

    public Reads(String door) {
      this.door = door;
    }

    public virtual Set<String> fields() {
      return new Set<String>{ 'season' };
    }

    public String run(Map<String, Object> asked) {
      Season__c season = AgentChangeCampWords.seasonOf(
        (String) asked.get('season')
      );
      Map<String, Object> read = AgentImports.readOf(season, door);
      // Only Import last year's read takes it (API-1.144).
      if ((String) asked.get(AgentImportQuestions.FIELD) == 'true') {
        // INGEST-5.5: the last import's files as it read them, as Roots' questions left open it.
        read.put('open_files', AgentImportQuestions.openFilesOf(season.Id));
      }
      return JSON.serialize(read, true);
    }
  }

  /** The screen's own reads, and the stamp a save carries back as seen. */
  public static Map<String, Object> readOf(Season__c season, String door) {
    Map<String, Object> read = new Map<String, Object>{
      'setup' => SeasonSetupController.getSeasonSetupInCamp(
        season.Camp__c,
        season.Id
      ),
      'answers' => ImportController.getAnswers(season.Camp__c),
      'seen' => stampOf(season, door)
    };
    if (door == CHOICES) {
      read.put('situation', ChoicesImportController.choicesSetup(season.Id));
    }
    if (door == LAST_YEAR) {
      // INGEST-5.7, 5.8: what earlier imports brought in and no one changed since.
      read.put('imported', ImportController.getImported(season.Id));
    }
    return read;
  }

  /** The stamp a door compares: Import last year's also covers weeks' versions and special days. */
  private static String stampOf(Season__c season, String door) {
    return door == LAST_YEAR
      ? AgentImportStamp.withSchedules(season.Id, season.Camp__c)
      : AgentImportStamp.of(season.Id, season.Camp__c);
  }

  /** Import a list's own save (ImportController.saveList), only while the setup is as read. */
  public static String saveList() {
    String plan = checkedPlan(SCREEN_LIST);
    try {
      return JSON.serialize(ImportController.saveList(plan), true);
    } catch (Exception e) {
      throw nothingSaved(e);
    }
  }

  /** Import worksheet's own save (ImportController.saveWorkbook), only while the setup is as read. */
  public static String saveWorkbook() {
    String plan = checkedPlan(SCREEN_LIST);
    try {
      return JSON.serialize(ImportController.saveWorkbook(plan), true);
    } catch (Exception e) {
      throw nothingSaved(e);
    }
  }

  /** Import last year's own save (ImportController.saveSetup), only while the setup is as read. */
  public static String saveLastYear() {
    String plan = checkedPlan(LAST_YEAR);
    try {
      return JSON.serialize(ImportController.saveSetup(plan), true);
    } catch (Exception e) {
      throw nothingSaved(e);
    }
  }

  private static ShoreshException nothingSaved(Exception e) {
    return new ShoreshException('Nothing was saved. ' + ScreenErrors.words(e));
  }

  /**
   * The plan sent, for the season named, once the season is locked and its setup is still as
   * read (seen); refused otherwise. The answer of a save is its result as JSON, which the
   * connector says in the screen's words.
   */
  private static String checkedPlan(String door) {
    Map<String, Object> body = AgentFields.body(FIELDS);
    Season__c season = AgentChangeCampWords.seasonOf(
      AgentFields.text(body, 'season')
    );
    String seen = AgentFields.text(body, 'seen');
    if (String.isBlank(seen)) {
      throw new ShoreshException(
        'Send the seen the review gave, so a change someone made since isn\'t replaced unseen.'
      );
    }
    // The plan as the connector sent it: never respaced (a name's own spaces are kept).
    Object sent = body.get('plan');
    String plan = sent instanceof String ? (String) sent : null;
    if (planSeason(plan) != season.Id) {
      throw new ShoreshException(
        'The import could not be read. Start it again.'
      );
    }
    // Imports and Undos in one season take turns; the setup is compared once it is ours.
    ImportUndo.lockSeason(season.Id);
    if (!SeenSaves.stamp(stampOf(season, door), seen)) {
      throw new AgentWeeks.ConflictException(
        'Someone changed the setup of "' +
          season.Name +
          '" since the file was reviewed, so nothing was saved. Review the file again.'
      );
    }
    return plan;
  }

  /** The season a plan is for; null when it can't be read. */
  private static Id planSeason(String plan) {
    try {
      Object id = ((Map<String, Object>) JSON.deserializeUntyped(plan))
        .get('seasonId');
      return id instanceof String ? (Id) (String) id : null;
    } catch (Exception e) {
      return null;
    }
  }
}
