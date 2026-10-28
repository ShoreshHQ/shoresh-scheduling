/**
 * What an import guessed, with the values its records hold now (SetupGuesses, ADR 0006 §21),
 * remembered for the camp with the import answers.
 */
public with sharing class SetupGuessRecords {
  /**
   * Remembers, for the camp, that these fields of these records were guessed, with the values
   * they hold now. Five queries at most, whatever the number: activities, places, groups, linked
   * choices, then the answers already there.
   */
  public static void remember(Id campId, Map<Id, Set<String>> fieldsOf) {
    Map<String, String> answerOf = new Map<String, String>();
    answerOf.putAll(activitiesNow(fieldsOf));
    answerOf.putAll(locationsNow(fieldsOf.keySet()));
    answerOf.putAll(groupsNow(fieldsOf.keySet()));
    answerOf.putAll(linkedChoicesNow(fieldsOf.keySet()));
    ImportAnswers.rememberEach(campId, answerOf);
  }

  private static Map<String, String> activitiesNow(
    Map<Id, Set<String>> fieldsOf
  ) {
    Map<String, String> result = new Map<String, String>();
    Set<Id> ids = idsOf(fieldsOf.keySet(), Activity__c.SObjectType);
    if (ids.isEmpty()) {
      return result;
    }
    for (Activity__c row : [
      SELECT
        Id,
        Name,
        Season__c,
        TimesPerWeekMin__c,
        TimesPerWeekMax__c,
        NoWeeklyMax__c,
        (
          SELECT
            Division__c,
            Division__r.Name,
            Division__r.Program__r.Name,
            Group__r.Name,
            Group__r.Division__r.Program__r.Name
          FROM Eligibilities__r
        )
      FROM Activity__c
      WHERE Id IN :ids
      WITH USER_MODE
    ]) {
      String item = SetupGuessValues.item(row.Season__c, 'Activity', row.Name);
      Set<String> fields = fieldsOf.get(row.Id);
      if (fields.contains(SetupGuessValues.OFTEN)) {
        result.put(
          SetupGuessValues.question(item, SetupGuessValues.OFTEN),
          SetupGuessValues.often(row)
        );
      }
      if (fields.contains(SetupGuessValues.WHO)) {
        result.put(
          SetupGuessValues.question(item, SetupGuessValues.WHO),
          SetupGuessValues.who(targetsOf(row.Eligibilities__r))
        );
      }
    }
    return result;
  }

  private static List<String> targetsOf(List<ActivityEligibility__c> rows) {
    List<String> targets = new List<String>();
    for (ActivityEligibility__c canDo : rows) {
      targets.add(
        canDo.Division__c != null
          ? SetupGuessValues.target(
              canDo.Division__r.Program__r.Name,
              canDo.Division__r.Name
            )
          : SetupGuessValues.target(
              canDo.Group__r.Division__r.Program__r.Name,
              canDo.Group__r.Name
            )
      );
    }
    return targets;
  }

  private static Map<String, String> locationsNow(Set<Id> recordIds) {
    Map<String, String> result = new Map<String, String>();
    Set<Id> ids = idsOf(recordIds, Location__c.SObjectType);
    if (ids.isEmpty()) {
      return result;
    }
    for (Location__c row : [
      SELECT Id, Name, Season__c, GroupsThatFit__c
      FROM Location__c
      WHERE Id IN :ids
      WITH USER_MODE
    ]) {
      result.put(
        SetupGuessValues.question(
          SetupGuessValues.item(row.Season__c, 'Location', row.Name),
          SetupGuessValues.FITS
        ),
        SetupGuessValues.wholeText(row.GroupsThatFit__c)
      );
    }
    return result;
  }

  private static Map<String, String> groupsNow(Set<Id> recordIds) {
    Map<String, String> result = new Map<String, String>();
    Set<Id> ids = idsOf(recordIds, Group__c.SObjectType);
    if (ids.isEmpty()) {
      return result;
    }
    for (Group__c row : [
      SELECT
        Id,
        Name,
        Division__r.Name,
        Division__r.NoDivision__c,
        Division__r.Program__r.Name,
        Division__r.Program__r.Season__c
      FROM Group__c
      WHERE Id IN :ids
      WITH USER_MODE
    ]) {
      result.put(
        SetupGuessValues.question(
          SetupGuessValues.bunk(
            row.Division__r.Program__r.Season__c,
            row.Division__r.Program__r.Name,
            row.Name
          ),
          SetupGuessValues.DIVISION
        ),
        // DIV-1.1: a holding record is no division; the group is in none.
        row.Division__r.NoDivision__c ? '' : row.Division__r.Name
      );
    }
    return result;
  }

  private static Map<String, String> linkedChoicesNow(Set<Id> recordIds) {
    Map<String, String> result = new Map<String, String>();
    Set<Id> ids = idsOf(recordIds, LinkedChoice__c.SObjectType);
    if (ids.isEmpty()) {
      return result;
    }
    for (LinkedChoice__c row : [
      SELECT
        Id,
        Name,
        ElectiveSet__r.Name,
        ElectiveSet__r.Season__c,
        (SELECT Weekday__c, TimeBlock__c, TimeBlock__r.Name FROM Times__r)
      FROM LinkedChoice__c
      WHERE Id IN :ids
      WITH USER_MODE
    ]) {
      Map<Id, String> blockNames = new Map<Id, String>();
      for (LinkedChoiceTime__c period : row.Times__r) {
        blockNames.put(period.TimeBlock__c, period.TimeBlock__r.Name);
      }
      result.put(
        SetupGuessValues.question(
          SetupGuessValues.linkedChoice(
            row.ElectiveSet__r.Season__c,
            row.ElectiveSet__r.Name,
            row.Name
          ),
          SetupGuessValues.PERIODS
        ),
        SetupGuessValues.periods(row.Times__r, blockNames)
      );
    }
    return result;
  }

  private static Set<Id> idsOf(Set<Id> ids, Schema.SObjectType type) {
    Set<Id> result = new Set<Id>();
    for (Id recordId : ids) {
      if (recordId.getSObjectType() == type) {
        result.add(recordId);
      }
    }
    return result;
  }
}
