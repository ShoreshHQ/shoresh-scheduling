/**
 * Who leads an activity, as its details panel has it (ADR 0031 piece B, API-1.158): the season's
 * staff by name, a list so a name with a comma stays one name (API-1.55), or nobody.
 */
public with sharing class AgentActivityLeaders {
  public static final String NOBODY = 'nobody';

  // The leaders asked, as the panel's save takes them; null until askedIn reads them.
  public List<Id> asked;
  private final List<StaffMember__c> staff;
  private final CampLabels labels;

  private AgentActivityLeaders(Id seasonId, CampLabels labels) {
    this.labels = labels;
    staff = [
      SELECT Id, Name
      FROM StaffMember__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name, Id
    ];
  }

  /** Who leads it as asked in a change, or null when it wasn't asked. */
  public static AgentActivityLeaders askedIn(
    Map<String, Object> given,
    AgentSetupRecords.Found found
  ) {
    if (!given.containsKey(AgentActivityRules.LEADS)) {
      return null;
    }
    AgentActivityLeaders leaders = new AgentActivityLeaders(
      found.seasonId,
      found.labels
    );
    leaders.asked = leaders.idsOf(given.get(AgentActivityRules.LEADS));
    return leaders;
  }

  /** Who leads it now: the staff members' names. */
  public static List<String> namesNow(Id activityId) {
    List<String> names = new List<String>();
    for (ActivityLeader__c row : [
      SELECT StaffMember__r.Name
      FROM ActivityLeader__c
      WHERE Activity__c = :activityId AND StaffMember__c != NULL
      WITH USER_MODE
    ]) {
      names.add(row.StaffMember__r.Name);
    }
    return names;
  }

  /** Who leads it, said one way whatever the order: a list of names A to Z, or nobody. */
  public static String said(List<String> names) {
    List<String> sorted = new List<String>();
    for (String name : names) {
      if (String.isNotBlank(name) && IncomingBatch.fold(name) != NOBODY) {
        sorted.add(name.normalizeSpace());
      }
    }
    if (sorted.isEmpty()) {
      return NOBODY;
    }
    sorted.sort();
    return JSON.serialize(sorted);
  }

  /** The names asked, said as a read says them (for the change's answer). */
  public String saidAsked() {
    List<String> names = new List<String>();
    for (StaffMember__c person : staff) {
      if (asked.contains(person.Id)) {
        names.add(person.Name);
      }
    }
    return 'who leads it ' +
      (names.isEmpty() ? NOBODY : String.join(names, ', '));
  }

  /**
   * The staff named (a list), as the panel's ticks offer them; nobody or blank is none. A name
   * not on the season's staff, or one two of them share, is refused.
   */
  private List<Id> idsOf(Object given) {
    List<Id> ids = new List<Id>();
    for (String name : AgentActivityWho.namesIn(given)) {
      if (String.isNotBlank(name) && IncomingBatch.fold(name) != NOBODY) {
        ids.add(onlyOne(name.trim()));
      }
    }
    return ids;
  }

  private Id onlyOne(String name) {
    List<StaffMember__c> found = new List<StaffMember__c>();
    List<String> names = new List<String>();
    for (StaffMember__c person : staff) {
      names.add(person.Name);
      if (IncomingBatch.fold(person.Name) == IncomingBatch.fold(name)) {
        found.add(person);
      }
    }
    if (found.size() == 1) {
      return found[0].Id;
    }
    if (found.size() > 1) {
      throw new ShoreshException(
        'More than one is called "' +
          name.left(80) +
          '", so Shoresh can\'t tell which you mean. Nothing was changed.'
      );
    }
    throw new ShoreshException(
      'There is no ' +
        labels.singularInSentence('StaffMember') +
        ' called "' +
        name.left(80) +
        '". ' +
        (names.isEmpty()
          ? 'There are no ' + labels.pluralInSentence('StaffMember') + ' yet.'
          : 'The ' +
            labels.pluralInSentence('StaffMember') +
            ': ' +
            String.join(names, ', ') +
            '.')
    );
  }

  /** The panel's own save of who leads it, compared with what it holds now (under the lock). */
  public RowSaves.Result save(Id activityId) {
    return ActivitiesController.saveWhoLeadsIt(
      activityId,
      asked,
      ActivityLeaders.now(activityId)
    );
  }
}
