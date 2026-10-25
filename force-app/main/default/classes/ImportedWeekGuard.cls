/**
 * Keeps the imported week as it came in (engine care plan, Greg 2026-10-25; ADR 0006): a version
 * an import made (Status Version, Origin Imported) is never deleted, its days never change, and it
 * stays its program's and week's import. Only the import that writes it, its Undo and deleting its
 * whole season (ImportVersionWrites, ImportUndo, SeasonTriggerHandler) allow() around their writes;
 * Shoresh's own publish, unpublish and rename (PublishedGuard.allow()) are trusted too. It can be
 * renamed; its origin still says Imported. Called from before triggers on Schedule__c, and from
 * PublishedGuard's one lookup for days (no query of its own there).
 */
public with sharing class ImportedWeekGuard {
  private static final String VERSION = 'Version';
  private static final String IMPORTED = 'Imported';
  // How many of an import's own writes, Undos or season deletes are under way.
  private static Integer allowed = 0;

  /** An import, its Undo or a season delete starts writing: call done() in a finally. */
  public static void allow() {
    allowed++;
  }

  public static void done() {
    allowed = Math.max(0, allowed - 1);
  }

  private static Boolean trusted() {
    return allowed > 0 || PublishedGuard.writing();
  }

  /** A version an import made. */
  public static Boolean isImported(Schedule__c schedule) {
    return schedule != null &&
      schedule.Status__c == VERSION &&
      schedule.Origin__c == IMPORTED;
  }

  /** Before delete of schedules. */
  public static void refuseDeletes(List<Schedule__c> olds) {
    if (trusted()) {
      return;
    }
    List<SObject> refused = new List<SObject>();
    List<Schedule__c> shown = new List<Schedule__c>();
    for (Schedule__c old : olds) {
      if (isImported(old)) {
        refused.add(old);
        shown.add(old);
      }
    }
    refuse(refused, shown, 'it can\'t be deleted.');
  }

  /** Before update of schedules: anything but its name stays as the import made it. */
  public static void checkSchedules(
    List<Schedule__c> news,
    Map<Id, Schedule__c> oldMap
  ) {
    if (oldMap == null || trusted()) {
      return;
    }
    List<SObject> refused = new List<SObject>();
    List<Schedule__c> shown = new List<Schedule__c>();
    for (Schedule__c schedule : news) {
      Schedule__c old = oldMap.get(schedule.Id);
      if (isImported(old) && changed(schedule, old)) {
        refused.add(schedule);
        shown.add(old);
      }
    }
    refuse(refused, shown, 'only its name can change.');
  }

  private static Boolean changed(Schedule__c schedule, Schedule__c old) {
    return !isImported(schedule) ||
      schedule.Program__c != old.Program__c ||
      schedule.Week__c != old.Week__c ||
      schedule.VersionReason__c != old.VersionReason__c;
  }

  /**
   * Rows of schedules PublishedGuard looked up (history: published history and imported weeks, by
   * Id): rows of an imported week are refused unless trusted. Returns the rest of history.
   */
  public static Map<Id, Schedule__c> refuseDays(
    List<SObject> rows,
    Schema.SObjectField scheduleField,
    Map<Id, Schedule__c> history
  ) {
    Map<Id, Schedule__c> rest = new Map<Id, Schedule__c>();
    Set<Id> imported = new Set<Id>();
    for (Schedule__c schedule : history.values()) {
      if (isImported(schedule)) {
        imported.add(schedule.Id);
      } else {
        rest.put(schedule.Id, schedule);
      }
    }
    if (imported.isEmpty() || allowed > 0) {
      return rest;
    }
    List<SObject> refused = new List<SObject>();
    List<Schedule__c> shown = new List<Schedule__c>();
    for (SObject row : rows) {
      Id scheduleId = (Id) row.get(scheduleField);
      if (imported.contains(scheduleId)) {
        refused.add(row);
        shown.add(history.get(scheduleId));
      }
    }
    refuse(refused, shown, 'its days can\'t be changed.');
    return rest;
  }

  /** Adds the error to each refused record; shown[i] is the imported week its message names. */
  private static void refuse(
    List<SObject> refused,
    List<Schedule__c> shown,
    String what
  ) {
    if (refused.isEmpty()) {
      return;
    }
    Set<Id> programIds = new Set<Id>();
    for (Schedule__c schedule : shown) {
      programIds.add(schedule.Program__c);
    }
    Map<Id, Id> campByProgram = new Map<Id, Id>();
    // System mode on purpose: the camp's words, for a week the person is already changing.
    for (Program__c program : [
      SELECT Id, Season__r.Camp__c
      FROM Program__c
      WHERE Id IN :programIds
      WITH SYSTEM_MODE
    ]) {
      campByProgram.put(program.Id, program.Season__r.Camp__c);
    }
    Map<Id, CampLabels> labelsByCamp = CampLabels.forCamps(
      new Set<Id>(campByProgram.values())
    );
    for (Integer i = 0; i < refused.size(); i++) {
      CampLabels labels = labelsByCamp.get(
        campByProgram.get(shown[i].Program__c)
      );
      refused[i].addError(message(labels, shown[i], what));
    }
  }

  @TestVisible
  private static String message(
    CampLabels labels,
    Schedule__c schedule,
    String what
  ) {
    if (labels == null) {
      labels = CampLabels.modelTermsOnly();
    }
    return '"' +
      schedule.Name +
      '" is the ' +
      labels.singularInSentence('Week') +
      ' as it was imported, which is kept as it came in, so ' +
      what;
  }
}
