/**
 * One name per season in a camp (word walk W6: two seasons both called "WW-A (made up)" were
 * accepted, and the Season picker showed two rows that read the same). A new season, a rename
 * and a copy are refused, in the camp's word, when another season of the camp has the name;
 * capitals and spaces at either end don't make a name another one. Runs in user mode.
 */
public with sharing class SeasonNames {
  /**
   * The seasons among the records a screen saves, each refused if its name is taken: by another
   * season of its camp, or by another season named in the same save. One query, however many.
   */
  public static void refuseTaken(List<SObject> records) {
    List<Season__c> named = namedSeasons(records);
    if (named.isEmpty()) {
      return;
    }
    // A season this save renames keeps its camp, and its name now is not taken.
    Map<Id, Id> campBySaved = new Map<Id, Id>();
    Set<String> taken = takenBesides(named, campBySaved);
    for (Season__c season : named) {
      Id campId = season.Camp__c != null
        ? season.Camp__c
        : campBySaved.get(season.Id);
      if (campId != null && !taken.add(keyOf(campId, season.Name))) {
        refuse(season.Name.trim(), campId);
      }
    }
  }

  /**
   * The names other seasons have (keyOf), in one query; campBySaved gets the camp of each season
   * the save names that is already saved.
   */
  private static Set<String> takenBesides(
    List<Season__c> named,
    Map<Id, Id> campBySaved
  ) {
    Set<String> names = new Set<String>();
    Set<Id> ids = new Set<Id>();
    for (Season__c season : named) {
      names.add(season.Name.trim());
      if (season.Id != null) {
        ids.add(season.Id);
      }
    }
    Set<String> taken = new Set<String>();
    for (Season__c row : [
      SELECT Id, Name, Camp__c
      FROM Season__c
      WHERE Name IN :names OR Id IN :ids
      WITH USER_MODE
    ]) {
      if (ids.contains(row.Id)) {
        campBySaved.put(row.Id, row.Camp__c);
      } else {
        taken.add(keyOf(row.Camp__c, row.Name));
      }
    }
    return taken;
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
      refuse(trimmed, campId);
    }
  }

  /** The seasons a save names (a new one, or a rename), with a name that isn't blank. */
  private static List<Season__c> namedSeasons(List<SObject> records) {
    List<Season__c> result = new List<Season__c>();
    for (SObject record : records) {
      if (
        record instanceof Season__c &&
        record.getPopulatedFieldsAsMap().containsKey('Name') &&
        String.isNotBlank(((Season__c) record).Name)
      ) {
        result.add((Season__c) record);
      }
    }
    return result;
  }

  /** A camp and a name, as one: capitals and spaces at either end don't count. */
  private static String keyOf(Id campId, String name) {
    return String.valueOf(campId) + '|' + name.trim().toLowerCase();
  }

  private static void refuse(String trimmed, Id campId) {
    throw new ShoreshException(
      'There is already a ' +
        CampLabels.forCamp(campId).singularInSentence('Season') +
        ' called "' +
        trimmed.left(80) +
        '".'
    );
  }
}
