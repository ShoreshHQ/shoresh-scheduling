/**
 * The part of "copy last season" that copies elective sets, their offerings and linked choices
 * (with their periods and who each is for). New records link to their originals by CopiedFrom__c;
 * the original season is only read. Campers and elective runs (choices and seats) belong to the
 * summer they happened in and are not copied (repo ADR 0018).
 */
public with sharing class ElectiveCopier {
  private final Id sourceSeasonId;
  private final Id newSeasonId;
  // Every original activity, time block and division => its copy.
  private final Map<Id, Id> copies;

  public ElectiveCopier(Id sourceSeasonId, Id newSeasonId, Map<Id, Id> copies) {
    this.sourceSeasonId = sourceSeasonId;
    this.newSeasonId = newSeasonId;
    this.copies = copies;
  }

  /** Copies everything, in a fixed number of reads and saves whatever the number of sets. */
  public void copy() {
    Map<Id, ElectiveSet__c> setCopies = new Map<Id, ElectiveSet__c>();
    for (ElectiveSet__c item : [
      SELECT Id, Name
      FROM ElectiveSet__c
      WHERE Season__c = :sourceSeasonId
      WITH USER_MODE
    ]) {
      setCopies.put(
        item.Id,
        new ElectiveSet__c(
          Season__c = newSeasonId,
          Name = item.Name,
          CopiedFrom__c = item.Id
        )
      );
    }
    if (setCopies.isEmpty()) {
      return;
    }
    Database.insert(setCopies.values(), AccessLevel.USER_MODE);
    Map<Id, Offering__c> offeringCopies = copyOfferings(setCopies);
    Map<Id, LinkedChoice__c> choiceCopies = copyLinkedChoices(
      setCopies,
      offeringCopies
    );
    copyLinkedChoiceTimes(choiceCopies);
    copyCoverage(choiceCopies);
  }

  private Map<Id, Offering__c> copyOfferings(
    Map<Id, ElectiveSet__c> setCopies
  ) {
    Map<Id, Offering__c> result = new Map<Id, Offering__c>();
    for (Offering__c offering : [
      SELECT
        Id,
        ElectiveSet__c,
        Activity__c,
        Seats__c,
        NoSeatLimit__c,
        MinimumToRun__c,
        Proposed__c
      FROM Offering__c
      WHERE ElectiveSet__c IN :setCopies.keySet()
      WITH USER_MODE
    ]) {
      Offering__c copy = offering.clone(false, true, false, false);
      copy.ElectiveSet__c = setCopies.get(offering.ElectiveSet__c).Id;
      copy.Activity__c = copies.get(offering.Activity__c);
      copy.CopiedFrom__c = offering.Id;
      result.put(offering.Id, copy);
    }
    Database.insert(result.values(), AccessLevel.USER_MODE);
    return result;
  }

  private Map<Id, LinkedChoice__c> copyLinkedChoices(
    Map<Id, ElectiveSet__c> setCopies,
    Map<Id, Offering__c> offeringCopies
  ) {
    Map<Id, LinkedChoice__c> result = new Map<Id, LinkedChoice__c>();
    for (LinkedChoice__c choice : [
      SELECT Id, Name, ElectiveSet__c, Offering__c, AppliesTo__c, SortOrder__c
      FROM LinkedChoice__c
      WHERE ElectiveSet__c IN :setCopies.keySet()
      WITH USER_MODE
    ]) {
      LinkedChoice__c copy = choice.clone(false, true, false, false);
      copy.ElectiveSet__c = setCopies.get(choice.ElectiveSet__c).Id;
      copy.Offering__c = offeringCopies.get(choice.Offering__c).Id;
      copy.CopiedFrom__c = choice.Id;
      result.put(choice.Id, copy);
    }
    Database.insert(result.values(), AccessLevel.USER_MODE);
    return result;
  }

  private void copyLinkedChoiceTimes(Map<Id, LinkedChoice__c> choiceCopies) {
    List<LinkedChoiceTime__c> rows = new List<LinkedChoiceTime__c>();
    for (LinkedChoiceTime__c row : [
      SELECT LinkedChoice__c, Weekday__c, TimeBlock__c
      FROM LinkedChoiceTime__c
      WHERE LinkedChoice__c IN :choiceCopies.keySet()
      WITH USER_MODE
    ]) {
      rows.add(
        new LinkedChoiceTime__c(
          LinkedChoice__c = choiceCopies.get(row.LinkedChoice__c).Id,
          Weekday__c = row.Weekday__c,
          TimeBlock__c = copies.get(row.TimeBlock__c)
        )
      );
    }
    Database.insert(rows, AccessLevel.USER_MODE);
  }

  private void copyCoverage(Map<Id, LinkedChoice__c> choiceCopies) {
    List<Coverage__c> rows = new List<Coverage__c>();
    for (Coverage__c row : [
      SELECT LinkedChoice__c, Division__c
      FROM Coverage__c
      WHERE LinkedChoice__c IN :choiceCopies.keySet()
      WITH USER_MODE
    ]) {
      rows.add(
        new Coverage__c(
          Season__c = newSeasonId,
          LinkedChoice__c = choiceCopies.get(row.LinkedChoice__c).Id,
          Division__c = copies.get(row.Division__c)
        )
      );
    }
    Database.insert(rows, AccessLevel.USER_MODE);
  }
}
