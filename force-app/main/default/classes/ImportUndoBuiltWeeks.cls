/**
 * Undo last import and the weeks built since (INGEST-5.10): a schedule the import didn't make
 * (built, locked, hand-placed, published, or a version of those) is in use of every group, time
 * block, activity and place its cells name, so Undo keeps them and names them. The import's own
 * kept-as-a-version week is not counted: it goes with the import. Reads the season's schedule
 * days once, on the first kind asked about.
 */
public with sharing class ImportUndoBuiltWeeks {
  private Id seasonId;
  private Set<Id> createdIds;
  private Set<Id> used;
  private Boolean keepEverything = false;

  public ImportUndoBuiltWeeks(Id seasonId, Set<Id> createdIds) {
    this.seasonId = seasonId;
    this.createdIds = createdIds;
  }

  /** Of these records, those a schedule the import didn't make uses. */
  public Set<Id> usedAmong(Set<Id> ids) {
    if (used == null) {
      used = read();
    }
    Set<Id> result = new Set<Id>(ids);
    if (!keepEverything) {
      result.retainAll(used);
    }
    return result;
  }

  private Set<Id> read() {
    Set<Id> named = new Set<Id>();
    String key;
    List<ScheduleDay__c> parts = new List<ScheduleDay__c>();
    // A day at a time, as the query is ordered: a season can hold many versions of each week.
    for (ScheduleDay__c part : [
      SELECT
        Schedule__c,
        Date__c,
        Part__c,
        Grid__c,
        GridFormatVersion__c,
        Revision__c
      FROM ScheduleDay__c
      WHERE
        Schedule__r.Program__r.Season__c = :seasonId
        AND Schedule__c NOT IN :createdIds
      WITH USER_MODE
      ORDER BY Schedule__c, Date__c, Part__c
    ]) {
      String partKey = part.Schedule__c + '|' + part.Date__c;
      if (partKey != key) {
        addFrom(parts, named);
        parts.clear();
        key = partKey;
      }
      parts.add(part);
    }
    addFrom(parts, named);
    return withWhatTheyBring(ImportUndoSpecialDays.withPlaces(named));
  }

  private void addFrom(List<ScheduleDay__c> parts, Set<Id> named) {
    if (parts.isEmpty()) {
      return;
    }
    ScheduleGrid grid = ScheduleDays.readDay(parts[0].Date__c, parts).grid;
    if (grid == null) {
      // A day that can't be read may name anything: nothing is taken from under it.
      keepEverything = true;
      return;
    }
    named.addAll(ImportUndoSpecialDays.referencesIn(grid));
    for (ScheduleGrid.Block block : grid.blocks) {
      ImportUndoSpecialDays.addId(named, block.id);
    }
  }

  /** A set kept keeps its offerings, linked choices and their activities; an activity its rain plan. */
  private Set<Id> withWhatTheyBring(Set<Id> named) {
    Set<Id> result = new Set<Id>(named);
    for (Offering__c offering : [
      SELECT Id, Activity__c
      FROM Offering__c
      WHERE ElectiveSet__c IN :named
      WITH USER_MODE
    ]) {
      result.add(offering.Id);
      result.add(offering.Activity__c);
    }
    for (LinkedChoice__c choice : [
      SELECT Id
      FROM LinkedChoice__c
      WHERE ElectiveSet__c IN :named
      WITH USER_MODE
    ]) {
      result.add(choice.Id);
    }
    for (Activity__c activity : [
      SELECT RainPlan__c
      FROM Activity__c
      WHERE Id IN :result AND RainPlan__c != NULL
      WITH USER_MODE
    ]) {
      result.add(activity.RainPlan__c);
    }
    return result;
  }
}
