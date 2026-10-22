/**
 * A season's special event or special day by name, spaces and capitals aside (names are unique in
 * a season, ADR 0014 choice 7), made when there is none: what "Set it up" points an imported cell
 * at (SpecialSetUp, ADR 0014 slice 4). In user mode.
 */
public with sharing class SpecialNamed {
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
