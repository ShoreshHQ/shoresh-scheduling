/**
 * Who can do an activity, as its details panel has it (docs/protocol/api.md API-1.51): divisions
 * and groups by name, or everyone (none means everyone).
 */
public with sharing class AgentActivityWho {
  public static final String EVERYONE = 'everyone';

  /** Who can do it now: the divisions' and groups' names. */
  public static List<String> namesNow(Id activityId) {
    List<String> names = new List<String>();
    for (ActivityEligibility__c row : [
      SELECT Division__r.Name, Group__r.Name
      FROM ActivityEligibility__c
      WHERE Activity__c = :activityId
      WITH USER_MODE
    ]) {
      names.add(
        row.Division__r != null ? row.Division__r.Name : row.Group__r.Name
      );
    }
    return names;
  }

  /** Who can do it now, as the save takes it. */
  public static List<Id> idsNow(Id activityId) {
    List<Id> ids = new List<Id>();
    for (ActivityEligibility__c row : [
      SELECT Division__c, Group__c
      FROM ActivityEligibility__c
      WHERE Activity__c = :activityId
      WITH USER_MODE
    ]) {
      ids.add(row.Division__c != null ? row.Division__c : row.Group__c);
    }
    return ids;
  }

  /** Who, said one way whatever the order: names A to Z, or everyone. */
  public static String said(List<String> names) {
    List<String> sorted = new List<String>();
    for (String name : names) {
      if (String.isNotBlank(name) && IncomingBatch.fold(name) != EVERYONE) {
        sorted.add(name.normalizeSpace());
      }
    }
    if (sorted.isEmpty()) {
      return EVERYONE;
    }
    sorted.sort();
    return String.join(sorted, ', ');
  }

  /**
   * The divisions and groups named (comma between), as the panel's ticks offer them; everyone or
   * blank is none. A name not there, or one two of them share, is refused.
   */
  public static List<Id> idsOf(String asked, AgentSetupRecords.Found found) {
    List<SObject> offered = offered(found.seasonId);
    List<String> names = new List<String>();
    for (SObject row : offered) {
      names.add((String) row.get('Name'));
    }
    List<Id> ids = new List<Id>();
    for (String name : asked.split(',')) {
      if (String.isNotBlank(name) && IncomingBatch.fold(name) != EVERYONE) {
        ids.add(offered[onlyOne(names, name.trim(), found)].Id);
      }
    }
    return ids;
  }

  /** The season's divisions (not No division) and groups, as the panel offers them. */
  private static List<SObject> offered(Id seasonId) {
    List<SObject> result = new List<SObject>();
    result.addAll(
      [
        SELECT Id, Name
        FROM Division__c
        WHERE Program__r.Season__c = :seasonId AND NoDivision__c = FALSE
        WITH USER_MODE
        ORDER BY SortOrder__c, Name
      ]
    );
    result.addAll(
      [
        SELECT Id, Name
        FROM Group__c
        WHERE Division__r.Program__r.Season__c = :seasonId
        WITH USER_MODE
        ORDER BY SortOrder__c, Name
      ]
    );
    return result;
  }

  private static Integer onlyOne(
    List<String> names,
    String name,
    AgentSetupRecords.Found found
  ) {
    List<Integer> at = new List<Integer>();
    for (Integer i = 0; i < names.size(); i++) {
      if (IncomingBatch.fold(names[i]) == IncomingBatch.fold(name)) {
        at.add(i);
      }
    }
    if (at.size() == 1) {
      return at[0];
    }
    if (at.size() > 1) {
      throw new ShoreshException(
        'More than one is called "' +
          name.left(80) +
          '", so Shoresh can\'t tell which you mean. Rename one in Shoresh, then ask again.'
      );
    }
    CampLabels labels = found.labels;
    throw new ShoreshException(
      'There is no ' +
        labels.singularInSentence('Division') +
        ' or ' +
        labels.singularInSentence('Group') +
        ' called "' +
        name.left(80) +
        '" that this user can see. ' +
        AgentWeeks.namesSaid(
          labels.pluralInSentence('Division') +
            ' and ' +
            labels.pluralInSentence('Group'),
          names
        )
    );
  }
}
