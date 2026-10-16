/**
 * Week exceptions: "this group (or activity, or location) does not run this week". The screens
 * show them in the positive, as "Runs in" weeks left unticked (see RunsIn). Saving marks, and
 * clearing a record's own marks when it is deleted.
 */
public with sharing class WeekExceptions {
  public static void save(List<WeekException__c> toAdd, List<Id> toRemove) {
    Set<Id> removeIds = new Set<Id>();
    for (Id rowId : toRemove == null ? new List<Id>() : toRemove) {
      if (rowId == null) {
        continue;
      }
      if (rowId.getSObjectType() != WeekException__c.SObjectType) {
        throw new ShoreshException(
          'These screens cannot delete that kind of record.'
        );
      }
      removeIds.add(rowId);
    }
    List<WeekException__c> adds = newMarks(toAdd);
    // Marks already cleared elsewhere are simply gone; only clear what is still there.
    List<WeekException__c> removes = [
      SELECT Id
      FROM WeekException__c
      WHERE Id IN :removeIds
      WITH USER_MODE
    ];
    Savepoint beforeSave = Database.setSavepoint();
    try {
      Database.delete(removes, true, AccessLevel.USER_MODE);
      Database.insert(adds, AccessLevel.USER_MODE);
    } catch (DmlException e) {
      Database.rollback(beforeSave);
      throw e;
    }
  }

  /** The marks to add, skipping any target and week already marked (one mark per pair). */
  private static List<WeekException__c> newMarks(List<WeekException__c> toAdd) {
    List<WeekException__c> given = toAdd == null
      ? new List<WeekException__c>()
      : toAdd;
    Set<Id> weekIds = new Set<Id>();
    for (WeekException__c row : given) {
      weekIds.add(row.Week__c);
    }
    Set<String> taken = new Set<String>();
    for (WeekException__c existing : [
      SELECT Week__c, Group__c, Activity__c, Location__c
      FROM WeekException__c
      WHERE Week__c IN :weekIds
      WITH USER_MODE
    ]) {
      taken.add(existing.Week__c + '|' + targetOf(existing));
    }
    List<WeekException__c> adds = new List<WeekException__c>();
    for (WeekException__c row : given) {
      // Only the week and its one target come from the screen.
      if (taken.add(row.Week__c + '|' + targetOf(row))) {
        adds.add(
          new WeekException__c(
            Week__c = row.Week__c,
            Group__c = row.Group__c,
            Activity__c = row.Activity__c,
            Location__c = row.Location__c
          )
        );
      }
    }
    return adds;
  }

  private static Id targetOf(WeekException__c row) {
    return row.Group__c != null
      ? row.Group__c
      : row.Activity__c != null ? row.Activity__c : row.Location__c;
  }

  /**
   * Deletes a record from the setup screens together with its own unticked weeks (Greg,
   * 2026-10-16): a group, activity, or location's week exceptions, and for a division or program
   * those of its groups. They would otherwise block the delete (restrict-delete lookups). All or
   * none.
   */
  public static void deleteWithWeeks(Id recordId) {
    Savepoint beforeDelete = Database.setSavepoint();
    try {
      Database.delete(
        [
          SELECT Id
          FROM WeekException__c
          WHERE
            Group__c = :recordId
            OR Group__r.Division__c = :recordId
            OR Group__r.Division__r.Program__c = :recordId
            OR Activity__c = :recordId
            OR Location__c = :recordId
          WITH USER_MODE
        ],
        true,
        AccessLevel.USER_MODE
      );
      Database.delete(recordId, true, AccessLevel.USER_MODE);
    } catch (Exception e) {
      Database.rollback(beforeDelete);
      throw e;
    }
  }
}
