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
  /** The groups that go with a deleted program or division, remembered as these kinds. */
  private static final Map<String, String> GROUPS_GO_AS = new Map<String, String>{
    'Program' => 'ProgramGroup',
    'Division' => 'Group'
  };

  /**
   * Remembers, for the record's camp, that it was deleted. Called before the delete; 3 queries
   * (4 for a program or division).
   *
   * A program's divisions, groups and time blocks go with it. Its groups are remembered with it,
   * as "deleted|ProgramGroup|<program>|<group>": Import last year makes up a new program's name
   * ("Program 2"), so only its groups can tell that last year's timetable for them was this
   * program's, and leave it out (c/shoreshImportEngine deleted.js deletedPrograms). A division's
   * groups go with it too: each is remembered as a deleted group of its program, which an import
   * matches as it does a group deleted by itself.
   */
  public static void remember(Id recordId) {
    Item found = itemOf(recordId);
    if (found == null || found.campId == null || String.isBlank(found.name)) {
      return;
    }
    List<String> questions = new List<String>{
      PREFIX +
      found.kind +
      '|' +
      found.scope +
      '|' +
      found.name
    };
    String groupKind = GROUPS_GO_AS.get(found.kind);
    if (groupKind != null) {
      questions.addAll(groupsOf(recordId, groupKind, found.program));
    }
    ImportAnswers.remember(found.campId, questions, DELETED);
  }

  /** The groups of a program or division, each once, as remembered with it. */
  private static List<String> groupsOf(
    Id parentId,
    String kind,
    String program
  ) {
    Set<String> questions = new Set<String>();
    for (Group__c row : [
      SELECT Name
      FROM Group__c
      WHERE Division__r.Program__c = :parentId OR Division__c = :parentId
      WITH USER_MODE
      ORDER BY Name
      LIMIT 2000
    ]) {
      questions.add(PREFIX + kind + '|' + program + '|' + row.Name);
    }
    return new List<String>(questions);
  }

  private class Item {
    String kind;
    String scope = '';
    String name;
    Id campId;
    // The program its groups are named with: the program itself, or the one it is in.
    String program;

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
        Item program = new Item('Program', row.Name, row.Season__r.Camp__c);
        program.program = row.Name;
        return program;
      }
    } else {
      return programItemOf(recordId, type);
    }
    return null;
  }

  /** A program's own item: its division, group, time block, fixed or recurring activity. */
  private static Item programItemOf(Id recordId, Schema.SObjectType type) {
    if (type == Division__c.SObjectType) {
      return divisionOf(recordId);
    }
    if (type == Group__c.SObjectType) {
      return groupOf(recordId);
    }
    if (type == TimeBlock__c.SObjectType) {
      return timeBlockOf(recordId);
    }
    if (type == FixedActivity__c.SObjectType) {
      return fixedOf(recordId);
    }
    if (type == RecurringActivity__c.SObjectType) {
      return recurringOf(recordId);
    }
    return null;
  }

  /** An item named with its program, in the program's camp. */
  private static Item inProgram(String kind, String name, Program__c program) {
    if (program == null) {
      return null;
    }
    Item found = new Item(kind, name, program.Season__r.Camp__c);
    found.scope = program.Name == null ? '' : program.Name;
    found.program = found.scope;
    return found;
  }

  private static Item divisionOf(Id recordId) {
    for (Division__c row : [
      SELECT Name, Program__r.Name, Program__r.Season__r.Camp__c
      FROM Division__c
      WHERE Id = :recordId
      WITH USER_MODE
    ]) {
      return inProgram('Division', row.Name, row.Program__r);
    }
    return null;
  }

  private static Item groupOf(Id recordId) {
    for (Group__c row : [
      SELECT
        Name,
        Division__r.Program__r.Name,
        Division__r.Program__r.Season__r.Camp__c
      FROM Group__c
      WHERE Id = :recordId
      WITH USER_MODE
    ]) {
      return inProgram('Group', row.Name, row.Division__r.Program__r);
    }
    return null;
  }

  private static Item timeBlockOf(Id recordId) {
    for (TimeBlock__c row : [
      SELECT Name, Program__r.Name, Program__r.Season__r.Camp__c
      FROM TimeBlock__c
      WHERE Id = :recordId
      WITH USER_MODE
    ]) {
      return inProgram('TimeBlock', row.Name, row.Program__r);
    }
    return null;
  }

  private static Item fixedOf(Id recordId) {
    for (FixedActivity__c row : [
      SELECT Name, Program__r.Name, Program__r.Season__r.Camp__c
      FROM FixedActivity__c
      WHERE Id = :recordId
      WITH USER_MODE
    ]) {
      return inProgram('FixedActivity', row.Name, row.Program__r);
    }
    return null;
  }

  private static Item recurringOf(Id recordId) {
    for (RecurringActivity__c row : [
      SELECT Name, Program__r.Name, Program__r.Season__r.Camp__c
      FROM RecurringActivity__c
      WHERE Id = :recordId
      WITH USER_MODE
    ]) {
      return inProgram('RecurringActivity', row.Name, row.Program__r);
    }
    return null;
  }
}
