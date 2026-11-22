/**
 * Campers, elective runs, preferences and seats (repo ADR 0018). Fills the hidden keys that make
 * "a camper number once in a season", "one set of choices per camper in a run" and "one seat per
 * camper at a time in a run" impossible to break, and keeps a run inside its season. Two campers
 * may share a name (ELECT-2.7): their name key only finds them.
 *
 * Preferences and seats are written hundreds at a time by Shoresh's own saves, which check what
 * they save; their triggers only fill keys and read nothing, so a big save stays within its query
 * budget. No message here names a camper: names stay out of errors and logs.
 *
 * Its reads are in system mode on purpose (repo ADR 0018 choice 60): they read only hidden keys
 * (no one is granted Key__c; these triggers fill it) and the season of the set, week and
 * schedule a run names, to refuse a duplicate or a run outside its season whoever saves it. They
 * return no name to anyone, and sharing still applies (the class is with sharing).
 */
public with sharing class ElectiveRunTriggers {
  // ---------------------------------------------------------------- campers

  /** A camper's hidden keys: a number once in a season, a name only to find them (CamperKeys). */
  public static void campersSaving(List<Camper__c> campers) {
    CamperKeys.fill(campers);
  }

  // ---------------------------------------------------------------- runs

  /** The set, week and schedules a run names are in its season, and its schedule is of its week. */
  public static void runsSaving(List<ElectiveRun__c> runs) {
    // A delete (no new rows) is only checked for an archived season (ArchivedSeasons).
    if (runs == null) {
      return;
    }
    Set<Id> ids = new Set<Id>();
    Set<Id> seasonIds = new Set<Id>();
    for (ElectiveRun__c run : runs) {
      ids.add(run.ElectiveSet__c);
      ids.add(run.Week__c);
      ids.add(run.Schedule__c);
      ids.add(run.FinalSchedule__c);
      seasonIds.add(run.Season__c);
    }
    ids.remove(null);
    RunLookups found = new RunLookups();
    Map<Id, Id> seasonOf = found.seasonOf;
    for (ElectiveSet__c item : [
      SELECT Id, Season__c
      FROM ElectiveSet__c
      WHERE Id IN :ids
      WITH SYSTEM_MODE
    ]) {
      seasonOf.put(item.Id, item.Season__c);
    }
    for (Week__c week : [
      SELECT Id, Season__c
      FROM Week__c
      WHERE Id IN :ids
      WITH SYSTEM_MODE
    ]) {
      seasonOf.put(week.Id, week.Season__c);
    }
    Map<Id, Id> weekOfSchedule = found.weekOfSchedule;
    for (Schedule__c schedule : [
      SELECT Id, Week__c, Program__r.Season__c
      FROM Schedule__c
      WHERE Id IN :ids
      WITH SYSTEM_MODE
    ]) {
      seasonOf.put(schedule.Id, schedule.Program__r.Season__c);
      weekOfSchedule.put(schedule.Id, schedule.Week__c);
    }
    SetupSeasons.LazyLabels labelsBySeason = SetupSeasons.labelsWhenNeeded(
      seasonIds
    );
    for (ElectiveRun__c run : runs) {
      refuseRun(run, found, labelsBySeason);
    }
  }

  /** The season of each set, week and schedule a run names, and the week of each schedule. */
  private class RunLookups {
    Map<Id, Id> seasonOf = new Map<Id, Id>();
    Map<Id, Id> weekOfSchedule = new Map<Id, Id>();
  }

  private static void refuseRun(
    ElectiveRun__c run,
    RunLookups found,
    SetupSeasons.LazyLabels labelsBySeason
  ) {
    Map<Id, Id> seasonOf = found.seasonOf;
    Map<Id, Id> weekOfSchedule = found.weekOfSchedule;
    if (otherSeason(seasonOf, run.ElectiveSet__c, run.Season__c)) {
      run.ElectiveSet__c.addError(
        inOtherSeason(labelsBySeason.get(run.Season__c), 'ElectiveSet')
      );
    } else if (otherSeason(seasonOf, run.Week__c, run.Season__c)) {
      run.Week__c.addError(
        inOtherSeason(labelsBySeason.get(run.Season__c), 'Week')
      );
    } else if (
      notOfWeek(weekOfSchedule, run.Schedule__c, run.Week__c) ||
      notOfWeek(weekOfSchedule, run.FinalSchedule__c, run.Week__c)
    ) {
      run.addError(
        'This schedule is not for these seats\' ' +
          labelsBySeason.get(run.Season__c).singularInSentence('Week') +
          '.'
      );
    }
  }

  private static Boolean otherSeason(
    Map<Id, Id> seasonOf,
    Id recordId,
    Id seasonId
  ) {
    return seasonOf.containsKey(recordId) && seasonOf.get(recordId) != seasonId;
  }

  private static Boolean notOfWeek(
    Map<Id, Id> weekOfSchedule,
    Id scheduleId,
    Id weekId
  ) {
    return weekOfSchedule.containsKey(scheduleId) &&
      weekOfSchedule.get(scheduleId) != weekId;
  }

  private static String inOtherSeason(CampLabels labels, String term) {
    return 'This ' +
      labels.singularInSentence(term) +
      ' belongs to a different ' +
      labels.singularInSentence('Season') +
      ' than these seats.';
  }

  // ---------------------------------------------------------------- choices and seats

  public static void preferencesSaving(List<Preference__c> rows) {
    // A delete (no new rows) is only checked for an archived season (ArchivedSeasons).
    if (rows == null) {
      return;
    }
    for (Preference__c row : rows) {
      row.Key__c = row.ElectiveRun__c + '|' + row.Camper__c;
    }
  }

  public static void assignmentsSaving(List<Assignment__c> rows) {
    // A delete (no new rows) is only checked for an archived season (ArchivedSeasons).
    if (rows == null) {
      return;
    }
    for (Assignment__c row : rows) {
      row.Key__c =
        row.ElectiveRun__c +
        '|' +
        row.Camper__c +
        '|' +
        String.valueOf(row.Date__c) +
        '|' +
        ElectiveSeatChecks.blockOf(row);
    }
  }
}
