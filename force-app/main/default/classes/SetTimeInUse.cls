/**
 * Why a time block, group, division, or program cannot be deleted because a fixed or recurring
 * activity depends on it, naming the item and the fix; null when nothing is in the way. (For
 * locations, InUse asks namesAt.) An item's own week ticks and who rows never stand in the way:
 * they go with it.
 */
public with sharing class SetTimeInUse {
  public static String reason(Id recordId) {
    Schema.SObjectType kind = recordId.getSObjectType();
    if (kind == TimeBlock__c.SObjectType) {
      return blockReason(recordId);
    }
    if (kind == Program__c.SObjectType) {
      return programReason(recordId);
    }
    if (kind == Group__c.SObjectType || kind == Division__c.SObjectType) {
      return coverageReason(recordId);
    }
    return null;
  }

  /**
   * For a location's refusal: what happens there ('"Flagpole" happens here') and its fix, or an
   * empty list when no fixed or recurring activity uses it.
   */
  public static List<String> atLocation(Id locationId, CampLabels labels) {
    List<String> names = namesAt(locationId);
    if (names.isEmpty()) {
      return names;
    }
    return new List<String>{
      InUse.quoted(names) +
      (names.size() == 1 ? ' happens' : ' happen') +
      ' here',
      'choose another ' +
      labels.singularInSentence('Location') +
      ' for ' +
      (names.size() == 1 ? 'it' : 'them') +
      ' on the ' +
      labels.plural('FixedActivity') +
      ' or ' +
      labels.plural('RecurringActivity') +
      ' screen'
    };
  }

  /** The fixed and recurring activities at a location, by name. */
  private static List<String> namesAt(Id locationId) {
    List<String> names = new List<String>();
    for (FixedActivity__c item : [
      SELECT Name
      FROM FixedActivity__c
      WHERE Location__c = :locationId
      WITH USER_MODE
      ORDER BY Name
      LIMIT 21
    ]) {
      names.add(item.Name);
    }
    for (RecurringActivity__c item : [
      SELECT Name
      FROM RecurringActivity__c
      WHERE Location__c = :locationId
      WITH USER_MODE
      ORDER BY Name
      LIMIT 21
    ]) {
      names.add(item.Name);
    }
    return names;
  }

  private static String blockReason(Id blockId) {
    Found found = new Found();
    found.add(
      [
        SELECT Name, Program__r.Season__r.Camp__c
        FROM FixedActivity__c
        WHERE TimeBlock__c = :blockId
        WITH USER_MODE
        ORDER BY Name
        LIMIT 21
      ]
    );
    found.add(
      [
        SELECT Name, Program__r.Season__r.Camp__c
        FROM RecurringActivity__c
        WHERE TimeBlock__c = :blockId
        WITH USER_MODE
        ORDER BY Name
        LIMIT 21
      ]
    );
    if (found.names.isEmpty()) {
      return null;
    }
    List<String> names = found.names;
    CampLabels labels = found.labels();
    return 'This can\'t be deleted yet: ' +
      InUse.quoted(names) +
      (names.size() == 1 ? ' starts' : ' start') +
      ' in it. First choose another ' +
      labels.singularInSentence('TimeBlock') +
      ' for ' +
      (names.size() == 1 ? 'it' : 'them') +
      ', then delete it.';
  }

  private static String programReason(Id programId) {
    Found found = new Found();
    found.add(
      [
        SELECT Name, Program__r.Season__r.Camp__c
        FROM FixedActivity__c
        WHERE Program__c = :programId
        WITH USER_MODE
        ORDER BY Name
        LIMIT 21
      ]
    );
    found.add(
      [
        SELECT Name, Program__r.Season__r.Camp__c
        FROM RecurringActivity__c
        WHERE Program__c = :programId
        WITH USER_MODE
        ORDER BY Name
        LIMIT 21
      ]
    );
    if (found.names.isEmpty()) {
      return null;
    }
    List<String> names = found.names;
    CampLabels labels = found.labels();
    return 'This can\'t be deleted yet: ' +
      InUse.quoted(names) +
      (names.size() == 1 ? ' is' : ' are') +
      ' set in it. Delete ' +
      (names.size() == 1 ? 'it' : 'them') +
      ' on the ' +
      labels.plural('FixedActivity') +
      ' or ' +
      labels.plural('RecurringActivity') +
      ' screen first, then delete this.';
  }

  /** A group or division (or a group in it) named in who a recurring activity covers. */
  private static String coverageReason(Id recordId) {
    List<String> names = new List<String>();
    Id campId;
    for (Coverage__c row : [
      SELECT RecurringActivity__r.Name, Season__r.Camp__c
      FROM Coverage__c
      WHERE
        RecurringActivity__c != NULL
        AND (Group__c = :recordId
        OR Division__c = :recordId
        OR Group__r.Division__c = :recordId)
      WITH USER_MODE
      ORDER BY RecurringActivity__r.Name, Id
      LIMIT 21
    ]) {
      campId = row.Season__r.Camp__c;
      if (!names.contains(row.RecurringActivity__r.Name)) {
        names.add(row.RecurringActivity__r.Name);
      }
    }
    if (names.isEmpty()) {
      return null;
    }
    CampLabels labels = CampLabels.forCamp(campId);
    return 'This can\'t be deleted yet: ' +
      (recordId.getSObjectType() == Division__c.SObjectType
        ? 'it (or one of its ' + labels.pluralInSentence('Group') + ') is'
        : 'it is') +
      ' in who ' +
      InUse.quoted(names) +
      (names.size() == 1 ? ' covers' : ' cover') +
      '. Change who ' +
      (names.size() == 1 ? 'it covers' : 'they cover') +
      ' on the ' +
      labels.plural('RecurringActivity') +
      ' screen first, then delete it.';
  }

  /** Names of the items found, and their camp (for its words). */
  private class Found {
    List<String> names = new List<String>();
    Id campId;

    void add(List<SObject> items) {
      for (SObject item : items) {
        names.add((String) item.get('Name'));
        campId = (Id) item.getSObject('Program__r')
          .getSObject('Season__r')
          .get('Camp__c');
      }
    }

    CampLabels labels() {
      return CampLabels.forCamp(campId);
    }
  }
}
