/**
 * Campers, elective runs, preferences and seats (repo ADR 0018). Fills the hidden keys that make
 * "a camper once in a season", "one set of choices per camper in a run" and "one seat per camper
 * at a time in a run" impossible to break, and keeps a run inside its season.
 *
 * Preferences and seats are written hundreds at a time by Shoresh's own saves, which check what
 * they save; their triggers only fill keys and read nothing, so a big save stays within its query
 * budget. No message here names a camper: names stay out of errors and logs.
 */
public with sharing class ElectiveRunTriggers {
  // ---------------------------------------------------------------- campers

  public static void campersSaving(List<Camper__c> campers) {
    Set<Id> seasonIds = new Set<Id>();
    Set<String> keys = new Set<String>();
    Set<Id> savingIds = new Set<Id>();
    for (Camper__c camper : campers) {
      camper.Key__c = camperKey(camper);
      keys.add(camper.Key__c);
      seasonIds.add(camper.Season__c);
      if (camper.Id != null) {
        savingIds.add(camper.Id);
      }
    }
    Set<String> taken = new Set<String>();
    for (Camper__c existing : [
      SELECT Key__c
      FROM Camper__c
      WHERE Key__c IN :keys AND Id NOT IN :savingIds
      WITH SYSTEM_MODE
    ]) {
      taken.add(existing.Key__c);
    }
    SetupSeasons.LazyLabels labelsBySeason = SetupSeasons.labelsWhenNeeded(
      seasonIds
    );
    for (Camper__c camper : campers) {
      if (taken.add(camper.Key__c)) {
        continue;
      }
      CampLabels labels = labelsBySeason.get(camper.Season__c);
      if (String.isNotBlank(camper.CamperNumber__c)) {
        camper.CamperNumber__c.addError(
          'Another ' +
            labels.singularInSentence('Camper') +
            ' in this ' +
            labels.singularInSentence('Season') +
            ' has this number.'
        );
      } else {
        camper.Name.addError(
          'Another ' +
            labels.singularInSentence('Camper') +
            ' in this ' +
            labels.singularInSentence('Season') +
            ' has this name and no number. Give each a number to tell them apart.'
        );
      }
    }
  }

  /**
   * Season and camper number; with no number, season and a SHA-256 of the name (spacing and
   * capitals aside), so the name is not stored twice. Two campers with one name and no number
   * share a key, which is the one refusal the desktop makes. Bringing in choices (ChoicesImport)
   * finds a sheet's campers already in the season by this key, so the name is never queried.
   */
  public static String camperKey(Camper__c camper) {
    if (String.isNotBlank(camper.CamperNumber__c)) {
      return camper.Season__c +
        '|#|' +
        camper.CamperNumber__c.deleteWhitespace().toLowerCase();
    }
    String name = camper.Name == null
      ? ''
      : camper.Name.normalizeSpace().toLowerCase();
    return camper.Season__c +
      '|n|' +
      EncodingUtil.convertToHex(
        Crypto.generateDigest('SHA-256', Blob.valueOf(name))
      );
  }

  // ---------------------------------------------------------------- runs

  /** The set, week and schedules a run names are in its season, and its schedule is of its week. */
  public static void runsSaving(List<ElectiveRun__c> runs) {
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
        'This schedule is not for the run\'s ' +
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
      ' than the run.';
  }

  // ---------------------------------------------------------------- choices and seats

  public static void preferencesSaving(List<Preference__c> rows) {
    for (Preference__c row : rows) {
      row.Key__c = row.ElectiveRun__c + '|' + row.Camper__c;
    }
  }

  public static void assignmentsSaving(List<Assignment__c> rows) {
    for (Assignment__c row : rows) {
      row.Key__c =
        row.ElectiveRun__c +
        '|' +
        row.Camper__c +
        '|' +
        String.valueOf(row.Date__c) +
        '|' +
        row.TimeBlock__c;
    }
  }
}
