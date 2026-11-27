/**
 * Who an elective set's time is for (ELECT-7.4; repo ADR 0027): each Coverage row of a set names
 * that set only (no recurring activity or linked choice beside it), exactly one division or
 * group, and belongs to the set's season, as the division or group does; a set with a time block
 * names only that block's program's divisions and groups (as CoverageTriggerHandler checks a
 * recurring activity's). CoverageTriggerHandler checks them before they are saved; a set whose
 * block moves to another program while its rows name the old one is refused (ElectiveSetMoves).
 *
 * System mode on purpose, as the trigger's other checks (ADR 0001 point 6): only seasons and
 * programs are read, and a refusal says nothing about another season.
 */
public with sharing class ElectiveSetWhoRows {
  // Each set's season and its time block's program (none without a block), and each division's
  // and group's.
  private Map<Id, Id> seasonOf = new Map<Id, Id>();
  private Map<Id, Id> programOf = new Map<Id, Id>();

  public static void check(List<Coverage__c> rows) {
    Set<Id> setIds = new Set<Id>();
    Set<Id> targetIds = new Set<Id>();
    for (Coverage__c row : rows) {
      setIds.add(row.ElectiveSet__c);
      targetIds.add(row.Division__c);
      targetIds.add(row.Group__c);
    }
    ElectiveSetWhoRows checker = new ElectiveSetWhoRows();
    Set<Id> setSeasons = checker.readSets(setIds);
    checker.readTargets(targetIds);
    SetupSeasons.LazyLabels labelsBySeason = SetupSeasons.labelsWhenNeeded(
      setSeasons
    );
    for (Coverage__c row : rows) {
      Id seasonId = checker.seasonOf.get(row.ElectiveSet__c);
      if (seasonId != null) {
        checker.refuse(row, labelsBySeason.get(seasonId));
      }
    }
  }

  /** The sets' seasons and programs; returns the seasons. */
  private Set<Id> readSets(Set<Id> setIds) {
    for (ElectiveSet__c item : [
      SELECT Id, Season__c, TimeBlock__r.Program__c
      FROM ElectiveSet__c
      WHERE Id IN :setIds
      WITH SYSTEM_MODE
    ]) {
      seasonOf.put(item.Id, item.Season__c);
      programOf.put(item.Id, item.TimeBlock__r?.Program__c);
    }
    return new Set<Id>(seasonOf.values());
  }

  private void readTargets(Set<Id> targetIds) {
    for (Division__c division : [
      SELECT Id, Program__c, Program__r.Season__c
      FROM Division__c
      WHERE Id IN :targetIds
      WITH SYSTEM_MODE
    ]) {
      seasonOf.put(division.Id, division.Program__r.Season__c);
      programOf.put(division.Id, division.Program__c);
    }
    for (Group__c grp : [
      SELECT Id, Division__r.Program__c, Division__r.Program__r.Season__c
      FROM Group__c
      WHERE Id IN :targetIds
      WITH SYSTEM_MODE
    ]) {
      seasonOf.put(grp.Id, grp.Division__r.Program__r.Season__c);
      programOf.put(grp.Id, grp.Division__r.Program__c);
    }
  }

  private void refuse(Coverage__c row, CampLabels labels) {
    if (!namesOneOfEach(row)) {
      row.addError(
        'Each row names one ' +
          labels.singularInSentence('ElectiveSet') +
          ' and one ' +
          labels.singularInSentence('Division') +
          ' or ' +
          labels.singularInSentence('Group') +
          '.'
      );
      return;
    }
    String targetTerm = row.Division__c != null ? 'Division' : 'Group';
    if (inOtherSeason(row)) {
      row.addError(SetupSeasons.otherSeason(labels, targetTerm, 'ElectiveSet'));
    } else if (inOtherProgram(row)) {
      row.addError(otherProgram(labels, targetTerm));
    }
  }

  /** One owner (the set alone) and one target (a division or a group). */
  private static Boolean namesOneOfEach(Coverage__c row) {
    Boolean oneOwner =
      row.RecurringActivity__c == null &&
      row.LinkedChoice__c == null;
    return oneOwner && (row.Division__c == null) != (row.Group__c == null);
  }

  private Boolean inOtherSeason(Coverage__c row) {
    Id seasonId = seasonOf.get(row.ElectiveSet__c);
    Id targetSeason = seasonOf.get(targetOf(row));
    return row.Season__c != seasonId ||
      (targetSeason != null &&
      targetSeason != seasonId);
  }

  /** A set with a time block names only that block's program's divisions and groups. */
  private Boolean inOtherProgram(Coverage__c row) {
    Id setProgram = programOf.get(row.ElectiveSet__c);
    Id target = targetOf(row);
    return setProgram != null &&
      programOf.containsKey(target) &&
      programOf.get(target) != setProgram;
  }

  private static Id targetOf(Coverage__c row) {
    return row.Division__c != null ? row.Division__c : row.Group__c;
  }

  /** "This division belongs to a different program than the elective set." */
  private static String otherProgram(CampLabels labels, String targetTerm) {
    return 'This ' +
      labels.singularInSentence(targetTerm) +
      ' belongs to a different ' +
      labels.singularInSentence('Program') +
      ' than the ' +
      labels.singularInSentence('ElectiveSet') +
      '.';
  }
}
