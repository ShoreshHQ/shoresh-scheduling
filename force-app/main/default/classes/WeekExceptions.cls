/**
 * Week exceptions for groups: "this group does not run this week". Saving marks and explaining,
 * in the camp's own words, why a group (or the division or program above it) cannot be deleted
 * while it is marked.
 */
public with sharing class WeekExceptions {
  public static void save(List<WeekException__c> toAdd, List<Id> toRemove) {
    List<WeekException__c> adds = new List<WeekException__c>();
    for (
      WeekException__c row : toAdd == null
        ? new List<WeekException__c>()
        : toAdd
    ) {
      // Only the week and group come from the screen.
      adds.add(
        new WeekException__c(Week__c = row.Week__c, Group__c = row.Group__c)
      );
    }
    List<Id> removes = toRemove == null ? new List<Id>() : toRemove;
    for (Id rowId : removes) {
      if (rowId.getSObjectType() != WeekException__c.SObjectType) {
        throw new ShoreshException(
          'These screens cannot delete that kind of record.'
        );
      }
    }
    Savepoint beforeSave = Database.setSavepoint();
    try {
      Database.delete(removes, true, AccessLevel.USER_MODE);
      Database.insert(adds, AccessLevel.USER_MODE);
    } catch (DmlException e) {
      Database.rollback(beforeSave);
      throw e;
    }
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
      ORDER BY Week__r.StartDate__c, Group__r.Name
      LIMIT 50
    ];
    if (marks.isEmpty()) {
      return null;
    }
    CampLabels labels = CampLabels.forCamp(marks[0].Week__r.Season__r.Camp__c);
    List<String> pairs = new List<String>();
    for (WeekException__c mark : marks) {
      pairs.add('"' + mark.Group__r.Name + '" in "' + mark.Week__r.Name + '"');
    }
    return 'This can\'t be deleted yet: it is marked as not running (' +
      String.join(pairs, ', ') +
      '). Clear ' +
      (marks.size() == 1 ? 'that' : 'those') +
      ' under ' +
      labels.plural('WeekException') +
      ' first, then delete it.';
  }
}
