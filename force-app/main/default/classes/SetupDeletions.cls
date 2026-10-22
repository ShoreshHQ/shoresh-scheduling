/**
 * Things you delete stay deleted (Greg, build log decision 45; desktop Director Guide §2 "Things
 * you delete stay deleted"): when a director deletes a setup item on a setup screen, the camp
 * remembers it, where import answers are remembered (ImportAnswer__c, ADR 0006), so a later
 * Import last year or Import a list leaves it out and says so, with a way to bring it back.
 *
 * Only a director's delete counts, as on the desktop (a delete with source "human"): Undo last
 * import and a season's delete take records away without remembering them.
 *
 * The question key is built from names, never record Ids, so it still holds in a copied season:
 * "deleted|<kind>|<program, for a program's own items>|<name>". The kinds are the import's own
 * words for what it makes (c/shoreshLists screen kinds), not object names.
 */
public with sharing class SetupDeletions {
  public static final String PREFIX = 'deleted|';
  public static final String DELETED = 'deleted';

  /** Remembers, for the record's camp, that it was deleted. Called before the delete; 3 queries. */
  public static void remember(Id recordId) {
    Item found = itemOf(recordId);
    if (found == null || found.campId == null || String.isBlank(found.name)) {
      return;
    }
    ImportAnswers.remember(
      found.campId,
      PREFIX + found.kind + '|' + found.scope + '|' + found.name,
      DELETED
    );
  }

  private class Item {
    String kind;
    String scope = '';
    String name;
    Id campId;

    Item(String kind, String name, Id campId) {
      this.kind = kind;
      this.name = name;
      this.campId = campId;
    }
  }

  /** The item's kind, program (for a program's own items), name, and camp; null for others. */
  private static Item itemOf(Id recordId) {
    Schema.SObjectType type = recordId.getSObjectType();
    if (type == Activity__c.SObjectType) {
      for (Activity__c row : [
        SELECT Name, Season__r.Camp__c
        FROM Activity__c
        WHERE Id = :recordId
        WITH USER_MODE
      ]) {
        return new Item('Activity', row.Name, row.Season__r.Camp__c);
      }
    } else if (type == Location__c.SObjectType) {
      for (Location__c row : [
        SELECT Name, Season__r.Camp__c
        FROM Location__c
        WHERE Id = :recordId
        WITH USER_MODE
      ]) {
        return new Item('Location', row.Name, row.Season__r.Camp__c);
      }
    } else if (type == LocationType__c.SObjectType) {
      for (LocationType__c row : [
        SELECT Name, Season__r.Camp__c
        FROM LocationType__c
        WHERE Id = :recordId
        WITH USER_MODE
      ]) {
        return new Item('LocationType', row.Name, row.Season__r.Camp__c);
      }
    } else if (type == Program__c.SObjectType) {
      for (Program__c row : [
        SELECT Name, Season__r.Camp__c
        FROM Program__c
        WHERE Id = :recordId
        WITH USER_MODE
      ]) {
        return new Item('Program', row.Name, row.Season__r.Camp__c);
      }
    } else {
      return programItemOf(recordId, type);
    }
    return null;
  }

  /** A program's own item: its division, group, time block, fixed or recurring activity. */
  private static Item programItemOf(Id recordId, Schema.SObjectType type) {
    Item found;
    Program__c program;
    if (type == Division__c.SObjectType) {
      for (Division__c row : [
        SELECT Name, Program__r.Name, Program__r.Season__r.Camp__c
        FROM Division__c
        WHERE Id = :recordId
        WITH USER_MODE
      ]) {
        found = new Item('Division', row.Name, null);
        program = row.Program__r;
      }
    } else if (type == Group__c.SObjectType) {
      for (Group__c row : [
        SELECT
          Name,
          Division__r.Program__r.Name,
          Division__r.Program__r.Season__r.Camp__c
        FROM Group__c
        WHERE Id = :recordId
        WITH USER_MODE
      ]) {
        found = new Item('Group', row.Name, null);
        program = row.Division__r.Program__r;
      }
    } else if (type == TimeBlock__c.SObjectType) {
      for (TimeBlock__c row : [
        SELECT Name, Program__r.Name, Program__r.Season__r.Camp__c
        FROM TimeBlock__c
        WHERE Id = :recordId
        WITH USER_MODE
      ]) {
        found = new Item('TimeBlock', row.Name, null);
        program = row.Program__r;
      }
    } else if (type == FixedActivity__c.SObjectType) {
      for (FixedActivity__c row : [
        SELECT Name, Program__r.Name, Program__r.Season__r.Camp__c
        FROM FixedActivity__c
        WHERE Id = :recordId
        WITH USER_MODE
      ]) {
        found = new Item('FixedActivity', row.Name, null);
        program = row.Program__r;
      }
    } else if (type == RecurringActivity__c.SObjectType) {
      for (RecurringActivity__c row : [
        SELECT Name, Program__r.Name, Program__r.Season__r.Camp__c
        FROM RecurringActivity__c
        WHERE Id = :recordId
        WITH USER_MODE
      ]) {
        found = new Item('RecurringActivity', row.Name, null);
        program = row.Program__r;
      }
    }
    if (found == null || program == null) {
      return null;
    }
    found.scope = program.Name == null ? '' : program.Name;
    found.campId = program.Season__r.Camp__c;
    return found;
  }
}
