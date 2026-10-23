/**
 * Bringing in a camp's choices sheet (electives slice E6; repo ADRs 0017 and 0018). The browser
 * reads the file (c/shoreshChoicesReader) and the director settles what it found; this saves only
 * what the director confirmed, in one transaction: names added as activities (each with a
 * proposed offering in the set), the campers, a Committed run for the set, week and schedule, and
 * one set of choices per camper. Bringing in again into a committed run keeps every hand change
 * and says where the sheet now differs; campers not on the new sheet keep theirs.
 *
 * Everything runs in user mode (queries WITH USER_MODE, writes AccessLevel.USER_MODE). Campers
 * are found by their key (ElectiveRunTriggers.camperKey), never by querying a name, and no
 * message names a camper: refusals give the sheet's row instead.
 *
 * The work is split by what it touches: ChoicesImportPlace (the season, set, week, schedule and
 * run), ChoicesImportCampers and ChoicesImportChoices (activities added, and each camper's
 * choices). Reads are bounded: a check is 7 queries, a save about 20 with its triggers, whatever
 * the number of campers (ChoicesImportTest).
 */
public with sharing class ChoicesImport {
  public static final String COMMITTED = 'Committed';
  public static final String FINAL_STATUS = 'Final';
  // Remembered answers to "a choice name Shoresh doesn't know" (ImportAnswers), by name.
  public static final String ANSWER_PREFIX = 'choiceName|';

  // ---------------------------------------------------------------- what the screen sends

  /** One sheet's campers and choices, as the director confirmed them. */
  public class Request {
    public Id seasonId;
    public Id electiveSetId;
    public Id weekId;
    public Id scheduleId;
    public String fileName;
    public String fingerprint;
    // The run's revision when the screen checked (null: there was no run then).
    public Decimal runRevision;
    // Names to add as activities (Add as an activity), each offered in the set, proposed.
    public List<String> addActivities = new List<String>();
    // Question -> answer, remembered for the camp (Same as..., Leave out).
    public Map<String, String> remember = new Map<String, String>();
    public List<SheetCamper> campers = new List<SheetCamper>();
  }

  /** One camper as the sheet has them. */
  public class SheetCamper {
    public Integer row;
    public String name;
    public String camperNumber;
    public String comment;
    public Id groupId;
    public List<SheetChoice> choices = new List<SheetChoice>();
  }

  /**
   * One choice, stored as it comes (Preference__c.Choices__c, JSON, no blank keys): n the name
   * as written, a the activity it is (or add: the name being added), r the rank (none:
   * unordered), k the kind (ranked, cell, unordered), d and p the day and period it is for.
   */
  public class SheetChoice {
    public String n;
    public Id a;
    public String add;
    public Integer r;
    public String k;
    public String d;
    public String p;
  }

  // ---------------------------------------------------------------- what the screen gets

  /** The season's elective sets and runs, and the camp's remembered answers about names. */
  public class Situation {
    @AuraEnabled
    public List<SetInfo> sets = new List<SetInfo>();
    @AuraEnabled
    public List<RunInfo> runs = new List<RunInfo>();
    @AuraEnabled
    public List<ImportAnswers.Answer> answers = new List<ImportAnswers.Answer>();
  }

  public class SetInfo {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    // The activities the set offers (proposed ones too: they are in the set, not yet confirmed).
    @AuraEnabled
    public List<Id> activityIds = new List<Id>();
  }

  public class RunInfo {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Id setId;
    @AuraEnabled
    public Id weekId;
    @AuraEnabled
    public Id scheduleId;
    @AuraEnabled
    public String status;
    @AuraEnabled
    public Decimal revision;
  }

  /** What bringing this sheet in would do, before anything is saved. */
  public class Check {
    @AuraEnabled
    public Id runId;
    @AuraEnabled
    public String runName;
    @AuraEnabled
    public Decimal runRevision;
    @AuraEnabled
    public Boolean isFinal = false;
    // Campers already in the season, and new ones.
    @AuraEnabled
    public Integer known = 0;
    @AuraEnabled
    public Integer added = 0;
    // Positions (in the request's campers) whose choices were changed by hand: kept. differs:
    // those of them the sheet now gives other choices for.
    @AuraEnabled
    public List<Integer> handChanged = new List<Integer>();
    @AuraEnabled
    public List<Integer> differs = new List<Integer>();
    // Campers whose number is saved under another name: [{ index, savedName }]. Shoresh's is kept.
    @AuraEnabled
    public List<Renamed> renamed = new List<Renamed>();
    // The run's campers that are not on this sheet: their choices stay.
    @AuraEnabled
    public Integer notOnSheet = 0;
  }

  public class Renamed {
    @AuraEnabled
    public Integer index;
    @AuraEnabled
    public String savedName;
  }

  /** What was brought in. */
  public class Done {
    @AuraEnabled
    public Id runId;
    @AuraEnabled
    public String runName;
    @AuraEnabled
    public Integer campers = 0;
    @AuraEnabled
    public Integer added = 0;
    @AuraEnabled
    public Integer handKept = 0;
    @AuraEnabled
    public Integer activitiesAdded = 0;
  }

  // ---------------------------------------------------------------- reads

  /** The screen's start: the season's sets (with what they offer), its runs, remembered answers. */
  public static Situation situation(Id seasonId) {
    Situation result = new Situation();
    Season__c season = seasonOf(seasonId);
    for (ElectiveSet__c item : [
      SELECT Id, Name, (SELECT Activity__c FROM Offerings__r ORDER BY Id)
      FROM ElectiveSet__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY Name, Id
    ]) {
      SetInfo info = new SetInfo();
      info.id = item.Id;
      info.name = item.Name;
      for (Offering__c offering : item.Offerings__r) {
        info.activityIds.add(offering.Activity__c);
      }
      result.sets.add(info);
    }
    for (ElectiveRun__c run : [
      SELECT
        Id,
        Name,
        ElectiveSet__c,
        Week__c,
        Schedule__c,
        Status__c,
        Revision__c
      FROM ElectiveRun__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY CreatedDate, Id
    ]) {
      result.runs.add(runInfo(run));
    }
    for (ImportAnswers.Answer answer : ImportAnswers.forCamp(season.Camp__c)) {
      if (answer.key != null && answer.key.startsWith(ANSWER_PREFIX)) {
        result.answers.add(answer);
      }
    }
    return result;
  }

  /** What bringing the sheet in would do. Changes nothing. */
  public static Check check(Request request) {
    ChoicesImportPlace place = new ChoicesImportPlace(request);
    Check result = new Check();
    result.isFinal = place.isFinal;
    if (place.run != null) {
      result.runId = place.run.Id;
      result.runName = place.run.Name;
      result.runRevision = place.run.Revision__c;
    }
    ChoicesImportCampers campers = new ChoicesImportCampers(request);
    ChoicesImportChoices choices = new ChoicesImportChoices(request, place);
    choices.readSaved();
    Set<Id> onSheet = new Set<Id>();
    for (Integer i = 0; i < request.campers.size(); i++) {
      Camper__c saved = campers.at(i);
      if (saved == null) {
        result.added++;
        continue;
      }
      result.known++;
      onSheet.add(saved.Id);
      Renamed renamed = renamedAt(i, request.campers[i], saved);
      if (renamed != null) {
        result.renamed.add(renamed);
      }
      Preference__c had = choices.savedFor(saved.Id);
      if (had != null && had.ManualChange__c) {
        result.handChanged.add(i);
        if (differs(had, request.campers[i])) {
          result.differs.add(i);
        }
      }
    }
    result.notOnSheet = choices.savedCount() - choices.savedAmong(onSheet);
    return result;
  }

  /** A camper number saved under another name (Shoresh's name is kept, and said), or null. */
  private static Renamed renamedAt(
    Integer index,
    SheetCamper sheetCamper,
    Camper__c saved
  ) {
    if (
      String.isBlank(sheetCamper.camperNumber) ||
      String.isBlank(sheetCamper.name) ||
      sheetCamper.name.normalizeSpace().toLowerCase() ==
      saved.Name.normalizeSpace().toLowerCase()
    ) {
      return null;
    }
    Renamed renamed = new Renamed();
    renamed.index = index;
    renamed.savedName = saved.Name;
    return renamed;
  }

  /** Whether the sheet now gives other choices than the ones changed by hand. */
  private static Boolean differs(Preference__c had, SheetCamper sheetCamper) {
    return ChoicesImportChoices.signature(had.Choices__c) !=
      ChoicesImportChoices.signature(sheetCamper.choices);
  }

  /** The answers about names to remember for the camp (only those about names). */
  public static Map<String, String> toRemember(Request request) {
    Map<String, String> result = new Map<String, String>();
    if (request.remember == null) {
      return result;
    }
    for (String question : request.remember.keySet()) {
      String answer = request.remember.get(question);
      if (
        question != null &&
        question.startsWith(ANSWER_PREFIX) &&
        String.isNotBlank(answer)
      ) {
        result.put(question.left(200), answer);
      }
    }
    return result;
  }

  // ---------------------------------------------------------------- the save

  /** Brings the sheet in, all or nothing. */
  public static Done bringIn(Request request) {
    ChoicesImportPlace place = new ChoicesImportPlace(request);
    place.refuseIfFinal();
    place.checkRevision();
    Savepoint before = Database.setSavepoint();
    try {
      Done result = new Done();
      ChoicesImportChoices choices = new ChoicesImportChoices(request, place);
      result.activitiesAdded = new ChoicesImportActivities(request, place)
        .add();
      choices.checkChoices();
      ChoicesImportCampers campers = new ChoicesImportCampers(request);
      Integer known = campers.save();
      result.added = request.campers.size() - known;
      result.campers = request.campers.size();
      place.saveRun();
      choices.readSaved();
      result.handKept = choices.save(campers);
      ImportAnswers.rememberEach(place.campId, toRemember(request));
      result.runId = place.run.Id;
      result.runName = place.run.Name;
      return result;
    } catch (Exception e) {
      Database.rollback(before);
      throw e;
    }
  }

  // ---------------------------------------------------------------- helpers

  public static Season__c seasonOf(Id seasonId) {
    List<Season__c> seasons = [
      SELECT Id, Camp__c
      FROM Season__c
      WHERE Id = :seasonId
      WITH USER_MODE
    ];
    if (seasons.isEmpty()) {
      throw new ShoreshException(
        'That season is no longer there. Reload the page.'
      );
    }
    return seasons[0];
  }

  private static RunInfo runInfo(ElectiveRun__c run) {
    RunInfo info = new RunInfo();
    info.id = run.Id;
    info.name = run.Name;
    info.setId = run.ElectiveSet__c;
    info.weekId = run.Week__c;
    info.scheduleId = run.Schedule__c;
    info.status = run.Status__c;
    info.revision = run.Revision__c;
    return info;
  }

  /** "Row 7: " for a refusal, so no message names a camper. */
  public static String rowWords(SheetCamper sheetCamper) {
    return sheetCamper.row == null ? '' : 'Row ' + sheetCamper.row + ': ';
  }

  /** Lower case, punctuation and spacing aside (c/shoreshImportEngine foldName). */
  public static String fold(String name) {
    return name == null
      ? ''
      : name.toLowerCase()
          .replace('&', ' and ')
          .replace('+', ' and ')
          .replaceAll('[^\\p{L}\\p{N}]+', '');
  }
}
