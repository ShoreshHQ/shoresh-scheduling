/**
 * A season's special event, special day or elective set by name, spaces and capitals aside (names
 * are unique in a season, ADR 0014 choice 7, ADR 0018 choice 5), made when there is none: what
 * "Set it up" points an imported cell at (SpecialSetUp, ADR 0014 slice 4, ADR 0018 slice E5), and
 * what Roots' card for a name last year's schedule gave sets up (repo ADR 0027). In user mode.
 */
public with sharing class SpecialNamed {
  /** A special day or event set up from Roots (RootsNoted): made by name, put on no day. */
  public class Named {
    @AuraEnabled
    public Id itemId;
    @AuraEnabled
    public String said;
  }

  /**
   * "Set it up" on Roots' card for what last year's schedule named (repo ADR 0027; SPECIAL-1.4):
   * the season's special day ('D') or event ('S') of that name, made when there is none, on no
   * day yet: the director puts it on a day of their choosing on Special events.
   */
  public static Named setUpNamed(Id seasonId, String kind, String name) {
    String trimmed = name == null ? '' : name.trim();
    if (String.isBlank(trimmed) || (kind != 'S' && kind != 'D')) {
      throw new ShoreshException('That can\'t be set up here.');
    }
    SObject record = kind == 'D'
      ? (SObject) specialDay(seasonId, trimmed)
      : (SObject) event(seasonId, trimmed);
    Named result = new Named();
    result.itemId = record.Id;
    result.said =
      '"' +
      (String) record.get('Name') +
      '" is set up. Put it on a day here.';
    return result;
  }

  /** The season's event of that name, or a new one. */
  public static SpecialEvent__c event(Id seasonId, String name) {
    for (SpecialEvent__c event : [
      SELECT Id, Name
      FROM SpecialEvent__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      if (NotedItems.loose(event.Name) == NotedItems.loose(name)) {
        return event;
      }
    }
    SpecialEvent__c event = new SpecialEvent__c(
      Name = name,
      Season__c = seasonId
    );
    Database.insert(event, AccessLevel.USER_MODE);
    return event;
  }

  /**
   * The season's elective set of that name, or a new one with no offerings yet (desktop: a set
   * made from a file is named as the file had it, its offerings added on the Electives screen).
   */
  public static ElectiveSet__c electiveSet(Id seasonId, String name) {
    for (ElectiveSet__c electiveSet : [
      SELECT Id, Name
      FROM ElectiveSet__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      if (NotedItems.loose(electiveSet.Name) == NotedItems.loose(name)) {
        return electiveSet;
      }
    }
    ElectiveSet__c electiveSet = new ElectiveSet__c(
      Name = name,
      Season__c = seasonId
    );
    Database.insert(electiveSet, AccessLevel.USER_MODE);
    return electiveSet;
  }

  /**
   * The season's special day of that name, or a new one starting from the camp's regular day, as
   * one added on the Special events screen does (SpecialDaySeed, ADR 0014 choice 12).
   */
  public static SpecialDay__c specialDay(Id seasonId, String name) {
    for (SpecialDay__c specialDay : [
      SELECT Id, Name
      FROM SpecialDay__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      if (NotedItems.loose(specialDay.Name) == NotedItems.loose(name)) {
        return specialDay;
      }
    }
    SpecialDay__c specialDay = new SpecialDay__c(
      Name = name,
      Season__c = seasonId
    );
    Database.insert(specialDay, AccessLevel.USER_MODE);
    SpecialDaySeed.seed(specialDay.Id);
    return specialDay;
  }
}
