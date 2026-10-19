/**
 * Week exceptions: "this group (or activity, or location) does not run this week". The screens
 * show them in the positive, as "Runs in" weeks left unticked (see RunsIn). Saving marks, and
 * clearing a record's own marks when it is deleted.
 */
public with sharing class WeekExceptions {
  // What a week exception can name: exactly one of these.
  private static final List<Schema.SObjectField> TARGETS = new List<Schema.SObjectField>{
    WeekException__c.Group__c,
    WeekException__c.Activity__c,
    WeekException__c.Location__c,
    WeekException__c.FixedActivity__c,
    WeekException__c.RecurringActivity__c
  };

  public static void save(List<WeekException__c> toAdd, List<Id> toRemove) {
    Set<Id> removeIds = new Set<Id>();
    for (Id rowId : toRemove == null ? new List<Id>() : toRemove) {
      if (rowId == null) {
        continue;
      }
      if (rowId.getSObjectType() != WeekException__c.SObjectType) {
        throw new ShoreshException('These screens can\'t delete that.');
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
      SELECT
        Week__c,
        Group__c,
        Activity__c,
        Location__c,
        FixedActivity__c,
        RecurringActivity__c
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
            Location__c = row.Location__c,
            FixedActivity__c = row.FixedActivity__c,
            RecurringActivity__c = row.RecurringActivity__c
          )
        );
      }
    }
    return adds;
  }

  private static Id targetOf(WeekException__c row) {
    for (Schema.SObjectField field : TARGETS) {
      if (row.get(field) != null) {
        return (Id) row.get(field);
      }
    }
    return null;
  }

  /**
   * Deletes a record from the setup screens together with its own unticked weeks (Greg,
   * 2026-10-16): a group, activity, location, fixed activity, or recurring activity's week
   * exceptions (and a recurring activity's who-it-covers rows), and for a division or program
   * those of its groups; and a week's drafts and versions. They would otherwise block the
   * delete (restrict-delete lookups). All or none.
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
            OR FixedActivity__c = :recordId
            OR RecurringActivity__c = :recordId
          WITH USER_MODE
        ],
        true,
        AccessLevel.USER_MODE
      );
      // A recurring activity's who-it-covers rows go with it too.
      Database.delete(
        [
          SELECT Id
          FROM Coverage__c
          WHERE RecurringActivity__c = :recordId
          WITH USER_MODE
        ],
        true,
        AccessLevel.USER_MODE
      );
      // A week's drafts and versions go with it, as in Shoresh desktop. A published schedule,
      // and one published once and replaced since, stays, and the week's own delete check
      // refuses the delete (history is kept).
      if (recordId.getSObjectType() == Week__c.SObjectType) {
        Database.delete(
          [
            SELECT Id
            FROM Schedule__c
            WHERE
              Week__c = :recordId
              AND Status__c != 'Published'
              AND PublishedAt__c = NULL
            WITH USER_MODE
          ],
          true,
          AccessLevel.USER_MODE
        );
      }
      Database.delete(recordId, true, AccessLevel.USER_MODE);
    } catch (Exception e) {
      Database.rollback(beforeDelete);
      throw e;
    }
  }
}
