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
    result.retainAll(used);
    return result;
  }

  private Set<Id> read() {
    Map<String, List<ScheduleDay__c>> byDay = new Map<String, List<ScheduleDay__c>>();
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
      String key = part.Schedule__c + '|' + part.Date__c;
      if (!byDay.containsKey(key)) {
        byDay.put(key, new List<ScheduleDay__c>());
      }
      byDay.get(key).add(part);
    }
    Set<Id> named = new Set<Id>();
    for (List<ScheduleDay__c> parts : byDay.values()) {
      ScheduleGrid grid = ScheduleDays.readDay(parts[0].Date__c, parts).grid;
      named.addAll(ImportUndoSpecialDays.referencesIn(grid));
      if (grid != null) {
        for (ScheduleGrid.Block block : grid.blocks) {
          ImportUndoSpecialDays.addId(named, block.id);
        }
      }
    }
    return ImportUndoSpecialDays.withPlaces(named);
  }
}
