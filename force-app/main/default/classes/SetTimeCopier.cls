/**
 * The part of "copy last season" that copies fixed and recurring activities and who each recurring
 * one covers. Their week ticks are copied with the season's other week exceptions. New records link
 * to their originals by CopiedFrom__c; the original season is only read.
 */
public with sharing class SetTimeCopier {
  private final Id sourceSeasonId;
  private final Id newSeasonId;
  // Every original program, time block, division, group, and location => its copy.
  private final Map<Id, Id> copies;

  public SetTimeCopier(Id sourceSeasonId, Id newSeasonId, Map<Id, Id> copies) {
    this.sourceSeasonId = sourceSeasonId;
    this.newSeasonId = newSeasonId;
    this.copies = copies;
  }

  /** Copies everything and returns original Id => copy Id for the fixed and recurring activities. */
  public Map<Id, Id> copy() {
    List<SObject> made = new List<SObject>();
    Map<Id, SObject> bySource = new Map<Id, SObject>();
    for (FixedActivity__c item : [
      SELECT
        Id,
        Name,
        Program__c,
        TimeBlock__c,
        Length__c,
        Location__c,
        SortOrder__c
      FROM FixedActivity__c
      WHERE Program__r.Season__c = :sourceSeasonId
      WITH USER_MODE
    ]) {
      bySource.put(item.Id, copyOf(item));
    }
    for (RecurringActivity__c item : [
      SELECT
        Id,
        Name,
        Program__c,
        TimeBlock__c,
        Length__c,
        Location__c,
        Monday__c,
        Tuesday__c,
        Wednesday__c,
        Thursday__c,
        Friday__c,
        SortOrder__c
      FROM RecurringActivity__c
      WHERE Program__r.Season__c = :sourceSeasonId
      WITH USER_MODE
    ]) {
      bySource.put(item.Id, copyOf(item));
    }
    made.addAll(bySource.values());
    Database.insert(made, AccessLevel.USER_MODE);
    copyCoverage(bySource);
    Map<Id, Id> result = new Map<Id, Id>();
    for (Id sourceId : bySource.keySet()) {
      result.put(sourceId, bySource.get(sourceId).Id);
    }
    return result;
  }

  private SObject copyOf(SObject item) {
    SObject copy = item.clone(false, true, false, false);
    copy.put('Program__c', copies.get((Id) item.get('Program__c')));
    copy.put('TimeBlock__c', copies.get((Id) item.get('TimeBlock__c')));
    Id location = (Id) item.get('Location__c');
    copy.put('Location__c', location == null ? null : copies.get(location));
    copy.put('CopiedFrom__c', item.Id);
    return copy;
  }

  private void copyCoverage(Map<Id, SObject> bySource) {
    List<Coverage__c> rows = new List<Coverage__c>();
    for (Coverage__c row : [
      SELECT RecurringActivity__c, Division__c, Group__c
      FROM Coverage__c
      WHERE RecurringActivity__c IN :bySource.keySet()
      WITH USER_MODE
    ]) {
      rows.add(
        new Coverage__c(
          Season__c = newSeasonId,
          RecurringActivity__c = bySource.get(row.RecurringActivity__c).Id,
          Division__c = row.Division__c == null
            ? null
            : copies.get(row.Division__c),
          Group__c = row.Group__c == null ? null : copies.get(row.Group__c)
        )
      );
    }
    Database.insert(rows, AccessLevel.USER_MODE);
  }
}
