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
 * Reads are bounded: a check is 7 queries, a save about 25 with its triggers, whatever the
 * number of campers (ChoicesImportTest).
 */
public with sharing class ChoicesImport {
  public static final String COMMITTED = 'Committed';
  public static final String FINAL_STATUS = 'Final';
  // Remembered answers to "a choice name Shoresh doesn't know" (ImportAnswers), by name.
  public static final String ANSWER_PREFIX = 'choiceName|';
  private static final Set<String> KINDS = new Set<String>{
    'ranked',
    'cell',
    'unordered'
  };

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
    Map<Id, SetInfo> setsById = new Map<Id, SetInfo>();
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
      setsById.put(item.Id, info);
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
    Context found = new Context(request);
    Check result = new Check();
    result.isFinal = found.isFinal;
    if (found.run != null) {
      result.runId = found.run.Id;
      result.runName = found.run.Name;
      result.runRevision = found.run.Revision__c;
    }
    found.readCampers();
    found.readChoices();
    Set<Id> onSheet = new Set<Id>();
    for (Integer i = 0; i < request.campers.size(); i++) {
      SheetCamper sheetCamper = request.campers[i];
      Camper__c saved = found.camperAt(i);
      if (saved == null) {
        result.added++;
        continue;
      }
      result.known++;
      onSheet.add(saved.Id);
      if (
        String.isNotBlank(sheetCamper.camperNumber) &&
        String.isNotBlank(sheetCamper.name) &&
        sheetCamper.name.normalizeSpace().toLowerCase() !=
        saved.Name.normalizeSpace().toLowerCase()
      ) {
        Renamed renamed = new Renamed();
        renamed.index = i;
        renamed.savedName = saved.Name;
        result.renamed.add(renamed);
      }
      Preference__c had = found.choicesOf.get(saved.Id);
      if (had != null && had.ManualChange__c) {
        result.handChanged.add(i);
        if (signature(had.Choices__c) != signature(sheetCamper.choices)) {
          result.differs.add(i);
        }
      }
    }
    for (Id camperId : found.choicesOf.keySet()) {
      if (!onSheet.contains(camperId)) {
        result.notOnSheet++;
      }
    }
    return result;
  }

  // ---------------------------------------------------------------- the save

  /** Brings the sheet in, all or nothing. */
  public static Done bringIn(Request request) {
    Context found = new Context(request);
    if (found.isFinal) {
      throw new ShoreshException(
        '"' + found.finalRunName + '" is final, so it can\'t take new choices.'
      );
    }
    found.checkRevision();
    Savepoint before = Database.setSavepoint();
    try {
      Done result = new Done();
      result.activitiesAdded = found.addActivities();
      found.checkChoices();
      found.readCampers();
      Integer known = found.saveCampers();
      result.added = request.campers.size() - known;
      result.campers = request.campers.size();
      found.saveRun();
      found.readChoices();
      result.handKept = found.saveChoices();
      ImportAnswers.rememberEach(found.campId, found.toRemember());
      result.runId = found.run.Id;
      result.runName = found.run.Name;
      return result;
    } catch (Exception e) {
      Database.rollback(before);
      throw e;
    }
  }

  // ---------------------------------------------------------------- one request's records

  /** The request's season, set, week and schedule, checked, and what the save reads and writes. */
  private class Context {
    Request request;
    Id campId;
    ElectiveSet__c electiveSet;
    Week__c week;
    Schedule__c schedule;
    ElectiveRun__c run;
    Boolean isFinal = false;
    String finalRunName;
    List<ElectiveRun__c> otherRuns = new List<ElectiveRun__c>();
    // The camper key of each request camper, in order, and the saved camper by key.
    List<String> keys = new List<String>();
    Map<String, Camper__c> campersByKey = new Map<String, Camper__c>();
    // The run's saved choices, by camper.
    Map<Id, Preference__c> choicesOf = new Map<Id, Preference__c>();
    // Activities added by this save, by folded name.
    Map<String, Id> addedIds = new Map<String, Id>();

    Context(Request given) {
      request = given;
      if (
        given == null ||
        given.seasonId == null ||
        given.electiveSetId == null ||
        given.weekId == null ||
        given.scheduleId == null
      ) {
        throw new ShoreshException(
          'Choose the elective set, the week and the schedule first.'
        );
      }
      if (given.campers == null || given.campers.isEmpty()) {
        throw new ShoreshException('There are no campers on this sheet.');
      }
      for (SheetCamper sheetCamper : given.campers) {
        if (sheetCamper.choices == null) {
          sheetCamper.choices = new List<SheetChoice>();
        }
      }
      campId = seasonOf(given.seasonId).Camp__c;
      readPlace();
      readRuns();
    }

    private void readPlace() {
      List<ElectiveSet__c> sets = [
        SELECT Id, Name
        FROM ElectiveSet__c
        WHERE Id = :request.electiveSetId AND Season__c = :request.seasonId
        WITH USER_MODE
      ];
      List<Week__c> weeks = [
        SELECT Id, Name
        FROM Week__c
        WHERE Id = :request.weekId AND Season__c = :request.seasonId
        WITH USER_MODE
      ];
      List<Schedule__c> schedules = [
        SELECT Id, Program__c, Program__r.Name
        FROM Schedule__c
        WHERE
          Id = :request.scheduleId
          AND Week__c = :request.weekId
          AND Program__r.Season__c = :request.seasonId
        WITH USER_MODE
      ];
      if (sets.isEmpty() || weeks.isEmpty() || schedules.isEmpty()) {
        throw new ShoreshException(
          'That elective set, week or schedule is no longer there. Reload the page.'
        );
      }
      electiveSet = sets[0];
      week = weeks[0];
      schedule = schedules[0];
    }

    /** The committed run for this set, week and schedule, if any; a final one refuses. */
    private void readRuns() {
      for (ElectiveRun__c each : [
        SELECT Id, Name, Status__c, Revision__c, Schedule__c
        FROM ElectiveRun__c
        WHERE
          ElectiveSet__c = :request.electiveSetId
          AND Week__c = :request.weekId
        WITH USER_MODE
        ORDER BY CreatedDate, Id
      ]) {
        if (each.Schedule__c != request.scheduleId) {
          otherRuns.add(each);
        } else if (each.Status__c == FINAL_STATUS) {
          finalRunName = each.Name;
        } else {
          run = each;
        }
      }
      isFinal = run == null && finalRunName != null;
    }

    /** Someone else brought choices into this run since the screen checked: refused. */
    void checkRevision() {
      Decimal now = run == null ? null : run.Revision__c;
      if (now != request.runRevision) {
        throw new ShoreshException(
          'Someone else brought in choices for this run since you started. Choose the file again to see them.'
        );
      }
    }

    /**
     * Names the director added as activities: made in the season (unless one of that name is
     * already there), each offered in the set as proposed, so it is confirmed on the Electives
     * screen before it gets campers (plan §2).
     */
    Integer addActivities() {
      Map<String, Id> seasonActivities = new Map<String, Id>();
      Set<Id> allIds = new Set<Id>();
      for (Activity__c activity : [
        SELECT Id, Name
        FROM Activity__c
        WHERE Season__c = :request.seasonId
        WITH USER_MODE
      ]) {
        seasonActivities.put(fold(activity.Name), activity.Id);
        allIds.add(activity.Id);
      }
      List<Activity__c> made = new List<Activity__c>();
      Set<String> asked = new Set<String>();
      for (
        String name : request.addActivities == null
          ? new List<String>()
          : request.addActivities
      ) {
        String key = fold(name);
        if (String.isBlank(key) || !asked.add(key)) {
          continue;
        }
        if (seasonActivities.containsKey(key)) {
          addedIds.put(key, seasonActivities.get(key));
        } else {
          made.add(
            new Activity__c(Season__c = request.seasonId, Name = name.trim())
          );
        }
      }
      if (!made.isEmpty()) {
        Database.insert(made, AccessLevel.USER_MODE);
        for (Activity__c activity : made) {
          addedIds.put(fold(activity.Name), activity.Id);
          allIds.add(activity.Id);
        }
      }
      // Every choice's activity must be one of the season's.
      for (SheetCamper sheetCamper : request.campers) {
        for (SheetChoice choice : sheetCamper.choices) {
          if (String.isNotBlank(choice.add)) {
            choice.a = addedIds.get(fold(choice.add));
            choice.add = null;
          }
          if (choice.a != null && !allIds.contains(choice.a)) {
            throw new ShoreshException(
              rowWords(sheetCamper) +
              'a choice names an activity that is no longer in this season. Reload the page.'
            );
          }
        }
      }
      if (addedIds.isEmpty()) {
        return made.size();
      }
      Set<Id> offered = new Set<Id>();
      for (Offering__c offering : [
        SELECT Activity__c
        FROM Offering__c
        WHERE ElectiveSet__c = :electiveSet.Id
        WITH USER_MODE
      ]) {
        offered.add(offering.Activity__c);
      }
      List<Offering__c> offerings = new List<Offering__c>();
      for (Id activityId : addedIds.values()) {
        if (offered.add(activityId)) {
          offerings.add(
            new Offering__c(
              ElectiveSet__c = electiveSet.Id,
              Activity__c = activityId,
              Proposed__c = true
            )
          );
        }
      }
      Database.insert(offerings, AccessLevel.USER_MODE);
      return made.size();
    }

    /** Each choice has a kind Shoresh knows and a name; each camper's bunk is of the program. */
    void checkChoices() {
      Set<Id> groupIds = new Set<Id>();
      for (SheetCamper sheetCamper : request.campers) {
        if (sheetCamper.groupId != null) {
          groupIds.add(sheetCamper.groupId);
        }
        for (SheetChoice choice : sheetCamper.choices) {
          if (!KINDS.contains(choice.k) || String.isBlank(choice.n)) {
            throw new ShoreshException(
              rowWords(sheetCamper) +
              'a choice could not be read. Choose the file again.'
            );
          }
        }
      }
      if (groupIds.isEmpty()) {
        return;
      }
      Integer ofProgram = [
        SELECT COUNT()
        FROM Group__c
        WHERE Id IN :groupIds AND Division__r.Program__c = :schedule.Program__c
        WITH USER_MODE
      ];
      if (ofProgram != groupIds.size()) {
        throw new ShoreshException(
          'A camper\'s group is not in this schedule\'s program. Reload the page.'
        );
      }
    }

    /** The saved camper for each request camper, by key; two rows with one key are refused. */
    void readCampers() {
      keys.clear();
      Map<String, Integer> firstRow = new Map<String, Integer>();
      for (SheetCamper sheetCamper : request.campers) {
        String key = ElectiveRunTriggers.camperKey(asCamper(sheetCamper));
        if (firstRow.containsKey(key)) {
          throw new ShoreshException(
            'Rows ' +
              firstRow.get(key) +
              ' and ' +
              sheetCamper.row +
              ' are one camper written two ways. Write them one way in the sheet, then choose it again.'
          );
        }
        firstRow.put(key, sheetCamper.row);
        keys.add(key);
      }
      campersByKey.clear();
      for (Camper__c saved : [
        SELECT Id, Name, Key__c, ParentComments__c
        FROM Camper__c
        WHERE Key__c IN :keys AND Season__c = :request.seasonId
        WITH USER_MODE
      ]) {
        campersByKey.put(saved.Key__c, saved);
      }
    }

    Camper__c camperAt(Integer index) {
      return campersByKey.get(keys[index]);
    }

    private Camper__c asCamper(SheetCamper sheetCamper) {
      return new Camper__c(
        Season__c = request.seasonId,
        Name = sheetCamper.name == null ? null : sheetCamper.name.trim(),
        CamperNumber__c = String.isBlank(sheetCamper.camperNumber)
          ? null
          : sheetCamper.camperNumber.trim()
      );
    }

    /**
     * New campers are made; a known camper keeps its name (a different one on the sheet is shown
     * by the check) and gains the sheet's comment when it is new (decision 48.3). Returns how
     * many were known.
     */
    Integer saveCampers() {
      List<Camper__c> made = new List<Camper__c>();
      List<SheetCamper> madeFrom = new List<SheetCamper>();
      List<Camper__c> changed = new List<Camper__c>();
      Integer known = 0;
      for (Integer i = 0; i < request.campers.size(); i++) {
        SheetCamper sheetCamper = request.campers[i];
        Camper__c saved = camperAt(i);
        if (saved == null) {
          Camper__c fresh = asCamper(sheetCamper);
          fresh.ParentComments__c = commentWith(null, sheetCamper.comment);
          made.add(fresh);
          madeFrom.add(sheetCamper);
          continue;
        }
        known++;
        String comments = commentWith(
          saved.ParentComments__c,
          sheetCamper.comment
        );
        if (comments != saved.ParentComments__c) {
          changed.add(
            new Camper__c(Id = saved.Id, ParentComments__c = comments)
          );
        }
      }
      List<Database.SaveResult> results = Database.insert(
        made,
        false,
        AccessLevel.USER_MODE
      );
      for (Integer i = 0; i < results.size(); i++) {
        if (!results[i].isSuccess()) {
          throw new ShoreshException(
            rowWords(madeFrom[i]) +
            ScreenErrors.messageOf(results[i].getErrors()[0])
          );
        }
      }
      Database.update(changed, AccessLevel.USER_MODE);
      for (Integer i = 0; i < made.size(); i++) {
        made[i].Key__c = ElectiveRunTriggers.camperKey(made[i]);
        campersByKey.put(made[i].Key__c, made[i]);
      }
      return known;
    }

    /** A new committed run, or the committed run's revision moved on. */
    void saveRun() {
      if (run == null) {
        run = new ElectiveRun__c(
          Season__c = request.seasonId,
          Name = runName(),
          ElectiveSet__c = electiveSet.Id,
          Week__c = week.Id,
          Schedule__c = schedule.Id,
          Status__c = COMMITTED,
          Revision__c = 1
        );
      } else {
        run.Revision__c = (run.Revision__c == null ? 0 : run.Revision__c) + 1;
      }
      run.SourceFile__c = String.isBlank(request.fileName)
        ? null
        : request.fileName.left(255);
      run.SourceFingerprint__c = String.isBlank(request.fingerprint)
        ? null
        : request.fingerprint.left(64);
      if (run.Id == null) {
        Database.insert(run, AccessLevel.USER_MODE);
      } else {
        Database.update(run, AccessLevel.USER_MODE);
      }
    }

    /** "Chugim · Week 3"; with another program's run of the same set and week, its program too. */
    private String runName() {
      String name = electiveSet.Name + ' · ' + week.Name;
      if (!otherRuns.isEmpty()) {
        name += ' · ' + schedule.Program__r.Name;
      }
      return name.left(80);
    }

    void readChoices() {
      choicesOf.clear();
      if (run == null || run.Id == null) {
        return;
      }
      for (Preference__c had : [
        SELECT Id, Camper__c, Group__c, Choices__c, ManualChange__c
        FROM Preference__c
        WHERE ElectiveRun__c = :run.Id
        WITH USER_MODE
      ]) {
        choicesOf.put(had.Camper__c, had);
      }
    }

    /**
     * One set of choices per camper: what the sheet says is always kept as imported; the choices
     * used are the sheet's unless they were changed by hand. The sheet's bunk is used; a camper
     * whose bunk the sheet doesn't give keeps the one saved. Returns how many hand changes stayed.
     */
    Integer saveChoices() {
      List<Preference__c> rows = new List<Preference__c>();
      Integer handKept = 0;
      for (Integer i = 0; i < request.campers.size(); i++) {
        SheetCamper sheetCamper = request.campers[i];
        Camper__c saved = camperAt(i);
        String imported = JSON.serialize(sheetCamper.choices, true);
        Preference__c had = choicesOf.get(saved.Id);
        if (had == null) {
          rows.add(
            new Preference__c(
              ElectiveRun__c = run.Id,
              Camper__c = saved.Id,
              Group__c = sheetCamper.groupId,
              Choices__c = imported,
              ImportedChoices__c = imported
            )
          );
          continue;
        }
        Preference__c change = new Preference__c(
          Id = had.Id,
          ImportedChoices__c = imported,
          Group__c = sheetCamper.groupId == null
            ? had.Group__c
            : sheetCamper.groupId
        );
        if (had.ManualChange__c) {
          handKept++;
        } else {
          change.Choices__c = imported;
        }
        rows.add(change);
      }
      UserModeWrites.save(rows);
      return handKept;
    }

    Map<String, String> toRemember() {
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
  }

  // ---------------------------------------------------------------- helpers

  private static Season__c seasonOf(Id seasonId) {
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
  private static String rowWords(SheetCamper sheetCamper) {
    return sheetCamper.row == null ? '' : 'Row ' + sheetCamper.row + ': ';
  }

  /** Lower case, punctuation and spacing aside, as the reader folds a name (c/shoreshImportEngine foldName). */
  @TestVisible
  private static String fold(String name) {
    return name == null
      ? ''
      : name.toLowerCase()
          .replace('&', ' and ')
          .replace('+', ' and ')
          .replaceAll('[^\\p{L}\\p{N}]+', '');
  }

  /**
   * The saved comment with the sheet's added: a blank never erases, the same words are not
   * added twice, and new words go on a line of their own after what was there.
   */
  @TestVisible
  private static String commentWith(String saved, String sheet) {
    String given = sheet == null ? '' : sheet.trim();
    if (given == '') {
      return saved;
    }
    if (String.isBlank(saved)) {
      return given.left(32768);
    }
    if (saved.contains(given)) {
      return saved;
    }
    return (saved + '\n' + given).left(32768);
  }

  /** Choices compared by what they are, not how they were written down. */
  @TestVisible
  private static String signature(String stored) {
    if (String.isBlank(stored)) {
      return signature(new List<SheetChoice>());
    }
    try {
      return signature(
        (List<SheetChoice>) JSON.deserialize(stored, List<SheetChoice>.class)
      );
    } catch (JSONException e) {
      // Stored some other way: compared as text, so any difference shows.
      return stored;
    }
  }

  private static String signature(List<SheetChoice> choices) {
    List<String> parts = new List<String>();
    for (SheetChoice choice : choices) {
      parts.add(
        String.join(
          new List<String>{
            choice.a != null ? String.valueOf(choice.a) : fold(choice.n),
            String.valueOf(choice.r),
            String.valueOf(choice.k),
            fold(choice.d),
            fold(choice.p)
          },
          '|'
        )
      );
    }
    parts.sort();
    return String.join(parts, ';');
  }
}
