/**
 * The words of SetupDelete's question (word walk W4): a name another record of its kind in the
 * season shares, named with its parent ("Bunk 2 (Juniors)"), and what really happens to what is
 * inside: a division's bunks go with it, a location type's locations stay with no type, a week's,
 * program's or elective set's contents go. Asked only before a delete, never on a common path.
 * Runs in user mode: only what the person can see is counted or named.
 */
public with sharing class SetupDeleteWords {
  // Kinds whose contents go with them (master-detail).
  private static final Set<Schema.SObjectType> CASCADES = new Set<Schema.SObjectType>{
    Program__c.SObjectType,
    Week__c.SObjectType,
    ElectiveSet__c.SObjectType
  };

  /** The name to ask with: a bunk or division with its parent when another one has its name. */
  public static String shown(Id recordId, String name) {
    Schema.SObjectType kind = recordId.getSObjectType();
    if (kind == Group__c.SObjectType) {
      return groupName(recordId, name);
    }
    if (kind == Division__c.SObjectType) {
      return divisionName(recordId, name);
    }
    return name;
  }

  /**
   * What happens to what is inside, as a sentence after the question: ' Its 3 bunks are deleted
   * too.', ' Its 2 locations stay, with no location type.', ' Anything inside it is deleted
   * too.', or '' when nothing is.
   */
  public static String inside(Id recordId) {
    Schema.SObjectType kind = recordId.getSObjectType();
    if (kind == Division__c.SObjectType) {
      return groupsInside(recordId);
    }
    if (kind == LocationType__c.SObjectType) {
      return locationsKept(recordId);
    }
    return CASCADES.contains(kind) ? ' Anything inside it is deleted too.' : '';
  }

  private static String groupName(Id groupId, String name) {
    List<Group__c> rows = [
      SELECT Division__r.Name, Division__r.Program__r.Season__c
      FROM Group__c
      WHERE Id = :groupId
      WITH USER_MODE
    ];
    if (rows.isEmpty()) {
      return name;
    }
    Id seasonId = rows[0].Division__r.Program__r.Season__c;
    Integer same = [
      SELECT COUNT()
      FROM Group__c
      WHERE Name = :name AND Division__r.Program__r.Season__c = :seasonId
      WITH USER_MODE
    ];
    return withParent(name, same, rows[0].Division__r.Name);
  }

  private static String divisionName(Id divisionId, String name) {
    List<Division__c> rows = [
      SELECT Program__r.Name, Program__r.Season__c
      FROM Division__c
      WHERE Id = :divisionId
      WITH USER_MODE
    ];
    if (rows.isEmpty()) {
      return name;
    }
    Id seasonId = rows[0].Program__r.Season__c;
    Integer same = [
      SELECT COUNT()
      FROM Division__c
      WHERE Name = :name AND Program__r.Season__c = :seasonId
      WITH USER_MODE
    ];
    return withParent(name, same, rows[0].Program__r.Name);
  }

  private static String withParent(String name, Integer same, String parent) {
    return same > 1 && parent != null ? name + ' (' + parent + ')' : name;
  }

  private static String groupsInside(Id divisionId) {
    for (Division__c row : [
      SELECT Program__r.Season__r.Camp__c, (SELECT Id FROM Groups__r)
      FROM Division__c
      WHERE Id = :divisionId
      WITH USER_MODE
    ]) {
      Integer count = row.Groups__r.size();
      if (count == 0) {
        return '';
      }
      CampLabels labels = CampLabels.forCamp(row.Program__r.Season__r.Camp__c);
      return ' Its ' +
        counted(count, 'Group', labels) +
        (count == 1 ? ' is' : ' are') +
        ' deleted too.';
    }
    return '';
  }

  private static String locationsKept(Id typeId) {
    for (LocationType__c row : [
      SELECT Season__r.Camp__c, (SELECT Id FROM Locations__r)
      FROM LocationType__c
      WHERE Id = :typeId
      WITH USER_MODE
    ]) {
      Integer count = row.Locations__r.size();
      if (count == 0) {
        return '';
      }
      CampLabels labels = CampLabels.forCamp(row.Season__r.Camp__c);
      return ' Its ' +
        counted(count, 'Location', labels) +
        (count == 1 ? ' stays' : ' stay') +
        ', with no ' +
        labels.singularInSentence('LocationType') +
        '.';
    }
    return '';
  }

  /** "3 bunks", "1 bunk", in the camp's words. */
  private static String counted(Integer count, String term, CampLabels labels) {
    return count +
      ' ' +
      (count == 1
        ? labels.singularInSentence(term)
        : labels.pluralInSentence(term));
  }

  /**
   * A set with seats (word walk W4): "Chugim has seats in Week 1 and Week 2. Clear them first.",
   * in the camp's words; the AI hears the first sentence.
   */
  public static String setHasSeats(
    List<ElectiveRun__c> runs,
    CampLabels labels
  ) {
    List<String> weeks = new List<String>();
    for (ElectiveRun__c run : runs) {
      if (!weeks.contains(run.Week__r.Name)) {
        weeks.add(run.Week__r.Name);
      }
    }
    return AgentRefusal.withFix(
      runs[0].ElectiveSet__r.Name +
        ' has ' +
        labels.pluralInSentence('Seats') +
        ' in ' +
        SetupDeleteContents.andList(weeks) +
        '.',
      'Clear them first.'
    );
  }
}
