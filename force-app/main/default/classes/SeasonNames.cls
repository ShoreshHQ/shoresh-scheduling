/**
 * One name per season in a camp (word walk W6: two seasons both called "WW-A (made up)" were
 * accepted, and the Season picker showed two rows that read the same). A new season, a rename
 * and a copy are refused, in the camp's word, when another season of the camp has the name;
 * capitals and spaces at either end don't make a name another one. Runs in user mode.
 */
public with sharing class SeasonNames {
  /** The seasons among the records a screen saves, each refused if its name is taken. */
  public static void refuseTaken(List<SObject> records) {
    for (SObject record : records) {
      if (
        record instanceof Season__c &&
        record.getPopulatedFieldsAsMap().containsKey('Name')
      ) {
        Season__c season = (Season__c) record;
        refuseTaken(season.Name, campOf(season), season.Id);
      }
    }
  }

  /** The name refused when another season of the camp (not itself) has it. */
  public static void refuseTaken(String name, Id campId, Id itself) {
    if (String.isBlank(name) || campId == null) {
      return;
    }
    String trimmed = name.trim();
    List<Season__c> same = [
      SELECT Id
      FROM Season__c
      WHERE Camp__c = :campId AND Name = :trimmed AND Id != :itself
      WITH USER_MODE
      LIMIT 1
    ];
    if (!same.isEmpty()) {
      throw new ShoreshException(
        'There is already a ' +
          CampLabels.forCamp(campId).singularInSentence('Season') +
          ' called "' +
          trimmed.left(80) +
          '".'
      );
    }
  }

  private static Id campOf(Season__c season) {
    if (season.Camp__c != null || season.Id == null) {
      return season.Camp__c;
    }
    List<Season__c> found = [
      SELECT Camp__c
      FROM Season__c
      WHERE Id = :season.Id
      WITH USER_MODE
    ];
    return found.isEmpty() ? null : found[0].Camp__c;
  }
}
