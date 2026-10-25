/**
 * Keeps published history as it is (wiki decision 0002; ADR 0008 part 5): a schedule that is or
 * was a week's published schedule (Status Published, or any of PublishedAt__c, PublishedBy__c,
 * PublishKey__c set), and its days, change only through Shoresh's own Publish, Unpublish and
 * rename (SchedulePublish, SchedulesController.renameSchedule), which allow() around their writes.
 * Anything else (a record page, a list view, the API) is refused with a message in the camp's own
 * words, and so is making a schedule published other than by Publish. One is never deleted.
 * Called from before triggers on Schedule__c, ScheduleDay__c and PublishedPlan__c (the special
 * days' and events' plans a published schedule carries).
 */
public with sharing class PublishedGuard {
  private static final String PUBLISHED = 'Published';
  // How many of Shoresh's own publish, unpublish or rename writes are under way.
  private static Integer allowed = 0;
  // Schedules already found not to be published history in this transaction: their days aren't
  // looked up again (a week's saves write days several times). Forgotten when one is updated.
  private static Set<Id> notHistory = new Set<Id>();

  /** Shoresh's own publish, unpublish or rename starts writing: call done() in a finally. */
  public static void allow() {
    allowed++;
  }

  public static void done() {
    allowed = Math.max(0, allowed - 1);
  }

  /** Shoresh's own publish, unpublish or rename is writing (ImportedWeekGuard trusts it too). */
  public static Boolean writing() {
    return allowed > 0;
  }

  /**
   * Before delete of schedules: one that is or was published is never deleted, not even by
   * Shoresh.
   */
  public static void refuseScheduleDeletes(List<Schedule__c> olds) {
    List<Schedule__c> history = new List<Schedule__c>();
    for (Schedule__c old : olds) {
      if (isPublished(old)) {
        history.add(old);
      }
    }
    refuse(history, history, repeated('deleted', history.size()));
  }

  /** Before insert or update of schedules (oldMap null on insert). */
  public static void checkSchedules(
    List<Schedule__c> news,
    Map<Id, Schedule__c> oldMap
  ) {
    if (oldMap != null) {
      notHistory.removeAll(oldMap.keySet());
    }
    if (allowed > 0) {
      return;
    }
    List<Schedule__c> refused = new List<Schedule__c>();
    List<Schedule__c> shown = new List<Schedule__c>();
    List<String> whats = new List<String>();
    for (Schedule__c schedule : news) {
      Schedule__c old = oldMap == null ? null : oldMap.get(schedule.Id);
      if (isPublished(old)) {
        // Published history changed: the message names it as it was.
        refused.add(schedule);
        shown.add(old);
        whats.add('changed');
      } else if (isPublished(schedule)) {
        // Made published some other way than Publish.
        refused.add(schedule);
        shown.add(schedule);
        whats.add('made');
      }
    }
    refuse(refused, shown, whats);
  }

  /** Before insert, update or delete of days: refused when their schedule is published history. */
  public static void checkDays(List<ScheduleDay__c> days) {
    checkChildren(days, ScheduleDay__c.Schedule__c);
  }

  /**
   * Before insert, update or delete of the special days' and events' plans a published schedule
   * carries (PublishedPlan__c, ADR 0014 slice 5): refused, as its days are, unless Publish writes
   * them.
   */
  public static void checkCarried(List<PublishedPlan__c> plans) {
    checkChildren(plans, PublishedPlan__c.Schedule__c);
  }

  /** Rows of a schedule (scheduleField: their schedule), refused when it is published history. */
  private static void checkChildren(
    List<SObject> rows,
    Schema.SObjectField scheduleField
  ) {
    if (allowed > 0) {
      return;
    }
    Set<Id> scheduleIds = new Set<Id>();
    for (SObject row : rows) {
      scheduleIds.add((Id) row.get(scheduleField));
    }
    scheduleIds.removeAll(notHistory);
    if (scheduleIds.isEmpty()) {
      return;
    }
    // System mode on purpose: history is protected whoever can reach the days.
    Map<Id, Schedule__c> history = new Map<Id, Schedule__c>(
      [
        SELECT
          Id,
          Name,
          Status__c,
          PublishedAt__c,
          PublishedBy__c,
          PublishKey__c,
          Program__c,
          Origin__c
        FROM Schedule__c
        WHERE
          Id IN :scheduleIds
          AND (Status__c = :PUBLISHED
          OR PublishedAt__c != NULL
          OR PublishedBy__c != NULL
          OR PublishKey__c != NULL
          OR (Status__c = 'Version'
          AND Origin__c = 'Imported'))
        WITH SYSTEM_MODE
      ]
    );
    for (Id scheduleId : scheduleIds) {
      if (!history.containsKey(scheduleId)) {
        notHistory.add(scheduleId);
      }
    }
    // The imported week is kept too, in this same lookup (ImportedWeekGuard).
    history = ImportedWeekGuard.refuseDays(rows, scheduleField, history);
    if (history.isEmpty()) {
      return;
    }
    List<SObject> refused = new List<SObject>();
    List<Schedule__c> shown = new List<Schedule__c>();
    for (SObject row : rows) {
      Id scheduleId = (Id) row.get(scheduleField);
      if (history.containsKey(scheduleId)) {
        refused.add(row);
        shown.add(history.get(scheduleId));
      }
    }
    refuse(refused, shown, repeated('days', refused.size()));
  }

  /** Is, or was, a week's published schedule. */
  private static Boolean isPublished(Schedule__c schedule) {
    return schedule != null &&
      (schedule.Status__c == PUBLISHED ||
      schedule.PublishedAt__c != null ||
      schedule.PublishedBy__c != null ||
      schedule.PublishKey__c != null);
  }

  private static List<String> repeated(String what, Integer count) {
    List<String> result = new List<String>();
    for (Integer i = 0; i < count; i++) {
      result.add(what);
    }
    return result;
  }

  /**
   * Adds the error to each refused record: shown[i] is the schedule its message names, whats[i]
   * what was refused (deleted, changed, made, days).
   */
  private static void refuse(
    List<SObject> refused,
    List<Schedule__c> shown,
    List<String> whats
  ) {
    if (refused.isEmpty()) {
      return;
    }
    Set<Id> programIds = new Set<Id>();
    for (Schedule__c schedule : shown) {
      programIds.add(schedule.Program__c);
    }
    Map<Id, Id> campByProgram = new Map<Id, Id>();
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
      Schedule__c schedule = shown[i];
      CampLabels labels = labelsByCamp.get(
        campByProgram.get(schedule.Program__c)
      );
      refused[i].addError(message(labels, schedule, whats[i]));
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
    if (what == 'made') {
      return 'Only Publish in Shoresh can make the ' +
        labels.singularInSentence('PublishedSchedule') +
        '.';
    }
    String text =
      '"' +
      schedule.Name +
      '" ' +
      (schedule.Status__c == PUBLISHED ? 'is' : 'was') +
      ' the ' +
      labels.singularInSentence('PublishedSchedule') +
      ', which is kept as history, so ';
    if (what == 'deleted') {
      return text + 'it can\'t be deleted.';
    }
    if (what == 'days') {
      return text + 'its days can\'t be changed.';
    }
    return text +
      'only Publish, Unpublish and rename in Shoresh can change it.';
  }
}
