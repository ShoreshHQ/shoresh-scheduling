/**
 * The season's elective sets, as the Electives setup screen shows them (repo ADR 0018, slice E4):
 * each set with who its time is for, its offerings, and its linked choices with their periods and
 * the divisions they name.
 * Three queries for any number of sets, in user mode; someone who may not read elective sets
 * gets none rather than a refusal of the whole season.
 */
public with sharing class ElectiveMenus {
  public class Setup {
    @AuraEnabled
    public List<ElectiveSet__c> sets = new List<ElectiveSet__c>();
    /** Every offering of the season's sets, in each set's order (activity name). */
    @AuraEnabled
    public List<Offering__c> offerings = new List<Offering__c>();
    /** Every linked choice, with its periods (Times__r) and divisions (Coverages__r). */
    @AuraEnabled
    public List<LinkedChoice__c> linkedChoices = new List<LinkedChoice__c>();
  }

  public static Setup forSeason(Id seasonId) {
    Setup result = new Setup();
    if (!canRead()) {
      return result;
    }
    // With its time (repo ADR 0027), shown and edited on the Electives screen: its last block
    // (ELECT-7.5) and who it is for (Coverages__r, ELECT-7.4) too, each when the user can read
    // it (left out otherwise, never a refusal).
    List<String> fields = new List<String>{ 'Id', 'Name' };
    for (
      Schema.SObjectField field : new List<Schema.SObjectField>{
        ElectiveSet__c.TimeBlock__c,
        ElectiveSet__c.Monday__c,
        ElectiveSet__c.Tuesday__c,
        ElectiveSet__c.Wednesday__c,
        ElectiveSet__c.Thursday__c,
        ElectiveSet__c.Friday__c,
        ElectiveSet__c.Saturday__c,
        ElectiveSet__c.Sunday__c
      }
    ) {
      fields.add(ShoreshSchema.queryName(field));
    }
    if (ElectiveSetTimes.lastReadable()) {
      fields.add(ShoreshSchema.queryName(ElectiveSet__c.LastTimeBlock__c));
    }
    if (ElectiveSetWho.readable()) {
      fields.add(
        '(SELECT Id, ' +
          ShoreshSchema.queryName(Coverage__c.Division__c) +
          ', ' +
          ShoreshSchema.queryName(Coverage__c.Group__c) +
          ' FROM ' +
          ShoreshSchema.childRelationship(
            ElectiveSet__c.SObjectType,
            Coverage__c.ElectiveSet__c
          ) +
          ' ORDER BY Id)'
      );
    }
    result.sets = Database.queryWithBinds(
      'SELECT ' +
        String.join(fields, ', ') +
        ' FROM ' +
        ShoreshSchema.queryName(ElectiveSet__c.SObjectType) +
        ' WHERE ' +
        ShoreshSchema.queryName(ElectiveSet__c.Season__c) +
        ' = :seasonId ORDER BY Name, Id',
      new Map<String, Object>{ 'seasonId' => seasonId },
      AccessLevel.USER_MODE
    );
    if (result.sets.isEmpty()) {
      return result;
    }
    // The offerings' order is the activity's name: a set has no order of its own, and the
    // screen shows them as the desktop does, alphabetically.
    result.offerings = [
      SELECT
        Id,
        ElectiveSet__c,
        Activity__c,
        Seats__c,
        NoSeatLimit__c,
        MinimumToRun__c,
        Proposed__c
      FROM Offering__c
      WHERE ElectiveSet__r.Season__c = :seasonId
      WITH USER_MODE
      ORDER BY Activity__r.Name, Id
    ];
    result.linkedChoices = [
      SELECT
        Id,
        Name,
        CreatedDate,
        ElectiveSet__c,
        Offering__c,
        AppliesTo__c,
        SortOrder__c,
        (SELECT Id, Weekday__c, TimeBlock__c FROM Times__r ORDER BY Id),
        (SELECT Id, Division__c FROM Coverages__r ORDER BY Id)
      FROM LinkedChoice__c
      WHERE ElectiveSet__r.Season__c = :seasonId
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name, Id
    ];
    return result;
  }

  private static Boolean canRead() {
    return Schema.sObjectType.ElectiveSet__c.isAccessible() &&
      Schema.sObjectType.Offering__c.isAccessible() &&
      Schema.sObjectType.LinkedChoice__c.isAccessible() &&
      Schema.sObjectType.LinkedChoiceTime__c.isAccessible();
  }
}
