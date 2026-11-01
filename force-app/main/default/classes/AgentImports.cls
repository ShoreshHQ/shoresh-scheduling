/**
 * Import a list and Import worksheet through an agent or the command line (docs/protocol/api.md
 * API-1.80, API-1.81). The file is read where the screen reads it, outside Salesforce (the
 * connector runs the screen's own module, c/shoreshLists), so each web address has two halves:
 *   GET  ?season=  what the screen reads: the season's setup (SeasonSetupController.
 *        getSeasonSetupInCamp, the camp's words in it), the camp's remembered answers
 *        (ImportController.getAnswers), and the setup's stamp as read (seen)
 *   POST {season, seen, plan}  the screen's own save (ImportController.saveList or saveWorkbook),
 *        made only while the season's setup still has the stamp seen, compared with the season
 *        locked as imports and Undos lock it (ImportUndo.lockSeason)
 */
public with sharing class AgentImports {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'seen',
    'plan'
  };

  /** What the screen reads before a file, answered as JSON (refusals as {"message"}). */
  public static void answerRead() {
    RestResponse response = RestContext.response;
    response.addHeader('Content-Type', 'application/json');
    try {
      for (String key : RestContext.request.params.keySet()) {
        if (key != 'season') {
          throw new ShoreshException(
            'Shoresh doesn\'t know the field "' +
              key.left(40) +
              '". The fields are: season.'
          );
        }
      }
      Season__c season = AgentChangeCampWords.seasonOf(
        RestContext.request.params.get('season')
      );
      response.statusCode = 200;
      response.responseBody = Blob.valueOf(
        JSON.serialize(readOf(season), true)
      );
    } catch (Exception e) {
      Boolean ours =
        e instanceof ShoreshException || e instanceof AuraHandledException;
      response.statusCode = ours ? 400 : 500;
      response.responseBody = Blob.valueOf(
        JSON.serialize(
          new Map<String, String>{
            'message' => ours ? e.getMessage() : ScreenErrors.loadingWords(e)
          }
        )
      );
    }
  }

  /** The screen's own reads, and the stamp a save carries back as seen. */
  public static Map<String, Object> readOf(Season__c season) {
    return new Map<String, Object>{
      'season' => season.Name,
      'setup' => SeasonSetupController.getSeasonSetupInCamp(
        season.Camp__c,
        season.Id
      ),
      'answers' => ImportController.getAnswers(season.Camp__c),
      'seen' => stamp(season.Id, season.Camp__c)
    };
  }

  /**
   * The screen's save of the plan the connector worked out, only while the season's setup is as
   * read (seen). The answer is the save's result as JSON, which the connector says in the
   * screen's words.
   */
  public static String save(Boolean workbook) {
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
    if (plan == null || planSeason(plan) != season.Id) {
      throw new ShoreshException(
        'The import could not be read. Start it again.'
      );
    }
    // Imports and Undos in one season take turns; the setup is compared once it is ours.
    ImportUndo.lockSeason(season.Id);
    if (stamp(season.Id, season.Camp__c) != seen) {
      throw new AgentWeeks.ConflictException(
        'Someone changed the setup of "' +
          season.Name +
          '" since the file was reviewed, so nothing was saved. Review the file again.'
      );
    }
    ImportSetupSaves.Result result;
    try {
      result = workbook
        ? ImportController.saveWorkbook(plan)
        : ImportController.saveList(plan);
    } catch (Exception e) {
      throw new ShoreshException('Nothing was saved. ' + ScreenErrors.words(e));
    }
    return JSON.serialize(result, true);
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

  /**
   * The season's setup as one short stamp: how many of each thing an import reads or writes, and
   * when the last of them changed. Any change, addition or deletion since gives another stamp.
   * Seven queries (each thing's rows come with its parent's), so a save keeps its own room.
   */
  public static String stamp(Id seasonId, Id campId) {
    Map<String, Long> counts = new Map<String, Long>();
    Map<String, Long> latest = new Map<String, Long>();
    for (Season__c row : [
      SELECT
        SystemModstamp,
        (SELECT SystemModstamp FROM Weeks__r),
        (SELECT SystemModstamp FROM LocationTypes__r),
        (SELECT SystemModstamp FROM Locations__r),
        (SELECT SystemModstamp FROM Programs__r),
        (SELECT SystemModstamp FROM Activities__r),
        (SELECT SystemModstamp FROM Coverages__r),
        (SELECT SystemModstamp FROM ElectiveSets__r),
        (SELECT SystemModstamp FROM Imports__r)
      FROM Season__c
      WHERE Id = :seasonId
      WITH USER_MODE
    ]) {
      add(counts, latest, 'Season', row);
      for (Week__c child : row.Weeks__r) {
        add(counts, latest, 'Week', child);
      }
      for (LocationType__c child : row.LocationTypes__r) {
        add(counts, latest, 'LocationType', child);
      }
      for (Location__c child : row.Locations__r) {
        add(counts, latest, 'Location', child);
      }
      for (Program__c child : row.Programs__r) {
        add(counts, latest, 'Program', child);
      }
      for (Activity__c child : row.Activities__r) {
        add(counts, latest, 'Activity', child);
      }
      for (Coverage__c child : row.Coverages__r) {
        add(counts, latest, 'Coverage', child);
      }
      for (ElectiveSet__c child : row.ElectiveSets__r) {
        add(counts, latest, 'ElectiveSet', child);
      }
      for (Import__c child : row.Imports__r) {
        add(counts, latest, 'Import', child);
      }
    }
    for (Camp__c row : [
      SELECT
        Id,
        (SELECT SystemModstamp FROM CampLabels__r),
        (SELECT SystemModstamp FROM ImportAnswers__r)
      FROM Camp__c
      WHERE Id = :campId
      WITH USER_MODE
    ]) {
      for (CampLabel__c child : row.CampLabels__r) {
        add(counts, latest, 'CampLabel', child);
      }
      for (ImportAnswer__c child : row.ImportAnswers__r) {
        add(counts, latest, 'ImportAnswer', child);
      }
    }
    for (Program__c row : [
      SELECT
        Id,
        (SELECT SystemModstamp FROM Divisions__r),
        (SELECT SystemModstamp FROM TimeBlocks__r),
        (SELECT SystemModstamp FROM FixedActivities__r),
        (SELECT SystemModstamp FROM RecurringActivities__r)
      FROM Program__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      for (Division__c child : row.Divisions__r) {
        add(counts, latest, 'Division', child);
      }
      for (TimeBlock__c child : row.TimeBlocks__r) {
        add(counts, latest, 'TimeBlock', child);
      }
      for (FixedActivity__c child : row.FixedActivities__r) {
        add(counts, latest, 'FixedActivity', child);
      }
      for (RecurringActivity__c child : row.RecurringActivities__r) {
        add(counts, latest, 'RecurringActivity', child);
      }
    }
    for (Division__c row : [
      SELECT Id, (SELECT SystemModstamp FROM Groups__r)
      FROM Division__c
      WHERE Program__r.Season__c = :seasonId
      WITH USER_MODE
    ]) {
      for (Group__c child : row.Groups__r) {
        add(counts, latest, 'Group', child);
      }
    }
    for (Activity__c row : [
      SELECT Id, (SELECT SystemModstamp FROM Eligibilities__r)
      FROM Activity__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      for (ActivityEligibility__c child : row.Eligibilities__r) {
        add(counts, latest, 'ActivityEligibility', child);
      }
    }
    for (ElectiveSet__c row : [
      SELECT
        Id,
        (SELECT SystemModstamp FROM Offerings__r),
        (SELECT SystemModstamp FROM LinkedChoices__r)
      FROM ElectiveSet__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      for (Offering__c child : row.Offerings__r) {
        add(counts, latest, 'Offering', child);
      }
      for (LinkedChoice__c child : row.LinkedChoices__r) {
        add(counts, latest, 'LinkedChoice', child);
      }
    }
    for (Week__c row : [
      SELECT Id, (SELECT SystemModstamp FROM WeekExceptions__r)
      FROM Week__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      for (WeekException__c child : row.WeekExceptions__r) {
        add(counts, latest, 'WeekException', child);
      }
    }
    List<String> kinds = new List<String>(counts.keySet());
    kinds.sort();
    List<String> parts = new List<String>();
    for (String kind : kinds) {
      parts.add(kind + ':' + counts.get(kind) + '@' + latest.get(kind));
    }
    return EncodingUtil.convertToHex(
        Crypto.generateDigest('SHA-256', Blob.valueOf(String.join(parts, '|')))
      )
      .left(16);
  }

  /** One row counted, and its last change kept when it is the latest of its kind. */
  private static void add(
    Map<String, Long> counts,
    Map<String, Long> latest,
    String kind,
    SObject row
  ) {
    Long at = ((Datetime) row.get('SystemModstamp')).getTime();
    counts.put(kind, (counts.containsKey(kind) ? counts.get(kind) : 0) + 1);
    if (!latest.containsKey(kind) || latest.get(kind) < at) {
      latest.put(kind, at);
    }
  }
}
