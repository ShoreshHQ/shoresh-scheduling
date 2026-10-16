/**
 * Week exceptions: "this group (or activity, or location) does not run this week". The screens
 * show them in the positive, as "Runs in" weeks left unticked (see RunsIn). Saving marks and
 * explaining, in the camp's own words, why a group (or the division or program above it) cannot
 * be deleted while it has a week unticked.
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
   * Why deleting this group, division, or program would be refused because a week exception
   * names one of its groups; null when nothing is in the way.
   */
  public static String blockingDelete(Id recordId) {
    Schema.SObjectType kind = recordId.getSObjectType();
    if (
      kind != Group__c.SObjectType &&
      kind != Division__c.SObjectType &&
      kind != Program__c.SObjectType
    ) {
      return null;
    }
    List<WeekException__c> marks = [
      SELECT Group__r.Name, Week__r.Name, Week__r.Season__r.Camp__c
      FROM WeekException__c
      WHERE
        Group__c = :recordId
        OR Group__r.Division__c = :recordId
        OR Group__r.Division__r.Program__c = :recordId
      WITH USER_MODE
      ORDER BY Week__r.StartDate__c, Group__r.Name, Id
      LIMIT 21
    ];
    if (marks.isEmpty()) {
      return null;
    }
    CampLabels labels = CampLabels.forCamp(marks[0].Week__r.Season__r.Camp__c);
    List<String> pairs = new List<String>();
    for (Integer i = 0; i < Math.min(marks.size(), 20); i++) {
      pairs.add(
        '"' + marks[i].Group__r.Name + '" in "' + marks[i].Week__r.Name + '"'
      );
    }
    if (marks.size() > 20) {
      pairs.add('and more');
    }
    String what = kind == Group__c.SObjectType
      ? 'it has'
      : 'some of its ' + labels.pluralInSentence('Group') + ' have';
    String weeks = marks.size() == 1
      ? 'that ' + labels.singularInSentence('Week')
      : 'those ' + labels.pluralInSentence('Week');
    return 'This can\'t be deleted yet: ' +
      what +
      ' ' +
      labels.pluralInSentence('Week') +
      ' unticked under Runs in (' +
      String.join(pairs, ', ') +
      '). Tick ' +
      weeks +
      ' again on the ' +
      labels.plural('Group') +
      ' screen first, then delete it.';
  }
}
