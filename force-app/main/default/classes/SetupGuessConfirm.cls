/**
 * "Looks right" on something an import guessed (ADR 0006 §21): the camp forgets that this field
 * of this record was guessed (SetupGuesses), so the setup screen no longer marks it. Two queries:
 * the record's name and camp, then the answer.
 */
public with sharing class SetupGuessConfirm {
  public static void confirm(Id recordId, String field) {
    if (!SetupGuessValues.fieldsFor(recordId).contains(field)) {
      throw new ShoreshException('That can\'t be marked as looked at.');
    }
    Found found = find(recordId);
    if (found == null) {
      throw new ShoreshException(
        'That was not found. It may have been deleted.'
      );
    }
    ImportAnswers.forget(
      found.campId,
      new Set<String>{ SetupGuessValues.question(found.item, field) }
    );
  }

  private class Found {
    Id campId;
    String item;

    Found(Id campId, String item) {
      this.campId = campId;
      this.item = item;
    }
  }

  private static Found find(Id recordId) {
    Schema.SObjectType type = recordId.getSObjectType();
    if (type == Activity__c.SObjectType) {
      return activity(recordId);
    }
    if (type == Location__c.SObjectType) {
      return location(recordId);
    }
    if (type == LinkedChoice__c.SObjectType) {
      return linkedChoice(recordId);
    }
    return bunk(recordId);
  }

  private static Found activity(Id recordId) {
    for (Activity__c row : [
      SELECT Name, Season__c, Season__r.Camp__c
      FROM Activity__c
      WHERE Id = :recordId
      WITH USER_MODE
    ]) {
      return new Found(
        row.Season__r.Camp__c,
        SetupGuessValues.item(row.Season__c, 'Activity', row.Name)
      );
    }
    return null;
  }

  private static Found location(Id recordId) {
    for (Location__c row : [
      SELECT Name, Season__c, Season__r.Camp__c
      FROM Location__c
      WHERE Id = :recordId
      WITH USER_MODE
    ]) {
      return new Found(
        row.Season__r.Camp__c,
        SetupGuessValues.item(row.Season__c, 'Location', row.Name)
      );
    }
    return null;
  }

  private static Found linkedChoice(Id recordId) {
    for (LinkedChoice__c row : [
      SELECT
        Name,
        ElectiveSet__r.Name,
        ElectiveSet__r.Season__c,
        ElectiveSet__r.Season__r.Camp__c
      FROM LinkedChoice__c
      WHERE Id = :recordId
      WITH USER_MODE
    ]) {
      return new Found(
        row.ElectiveSet__r.Season__r.Camp__c,
        SetupGuessValues.linkedChoice(
          row.ElectiveSet__r.Season__c,
          row.ElectiveSet__r.Name,
          row.Name
        )
      );
    }
    return null;
  }

  private static Found bunk(Id recordId) {
    for (Group__c row : [
      SELECT
        Name,
        Division__r.Program__r.Name,
        Division__r.Program__r.Season__c,
        Division__r.Program__r.Season__r.Camp__c
      FROM Group__c
      WHERE Id = :recordId
      WITH USER_MODE
    ]) {
      return new Found(
        row.Division__r.Program__r.Season__r.Camp__c,
        SetupGuessValues.bunk(
          row.Division__r.Program__r.Season__c,
          row.Division__r.Program__r.Name,
          row.Name
        )
      );
    }
    return null;
  }
}
