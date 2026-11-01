/**
 * A season's electives for incoming batches (IncomingCamperGroup, IncomingCamperElectiveChoice):
 * each elective set's run in each week, found by the names the camp uses (the set's and the
 * week's, spacing, capitals and punctuation aside), the season's groups, and campers' choices
 * in them. All in user mode.
 */
public with sharing class IncomingRuns {
  private List<ElectiveRun__c> runs;
  // The season's groups by folded name; a name two groups share is left out (not guessed).
  private Map<String, Id> groups = new Map<String, Id>();
  // The season's elective set and week names, folded; read once, only to say a refusal.
  private Set<String> setNames;
  private Set<String> weekNames;

  private IncomingRuns(List<ElectiveRun__c> runs) {
    this.runs = runs;
  }

  /** The season's runs with their elective sets' names (a key that sends choices reads sets). */
  public static IncomingRuns forChoices(Id seasonId) {
    return new IncomingRuns(
      [
        SELECT
          Id,
          Name,
          Status__c,
          ElectiveSet__c,
          ElectiveSet__r.Name,
          Week__r.Name
        FROM ElectiveRun__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
        ORDER BY Name
      ]
    );
  }

  /** The season's runs and groups (a key that sends bunks reads no sets). */
  public static IncomingRuns forBunks(Id seasonId) {
    return new IncomingRuns(
        [
          SELECT Id, Name, Status__c, Week__r.Name
          FROM ElectiveRun__c
          WHERE Season__c = :seasonId
          WITH USER_MODE
          ORDER BY Name
        ]
      )
      .withGroups(seasonId);
  }

  /** Reads the season's groups (only capabilities that set a bunk can). */
  private IncomingRuns withGroups(Id seasonId) {
    for (Group__c item : [
      SELECT Id, Name
      FROM Group__c
      WHERE Division__r.Program__r.Season__c = :seasonId
      WITH USER_MODE
    ]) {
      String key = IncomingBatch.fold(item.Name);
      groups.put(key, groups.containsKey(key) ? null : item.Id);
    }
    return this;
  }

  /** The runs in the named week (every run with none named). */
  public List<ElectiveRun__c> inWeek(String week) {
    List<ElectiveRun__c> result = new List<ElectiveRun__c>();
    for (ElectiveRun__c run : runs) {
      if (String.isBlank(week) || same(run.Week__r.Name, week)) {
        result.add(run);
      }
    }
    return result;
  }

  /** The named set's run in the named week, or null. */
  public ElectiveRun__c run(String electiveSet, String week) {
    for (ElectiveRun__c run : inWeek(week)) {
      if (!String.isBlank(week) && same(run.ElectiveSet__r.Name, electiveSet)) {
        return run;
      }
    }
    return null;
  }

  /** The season's group of that name, or null (none, or two with the name). */
  public Id groupNamed(String name) {
    return groups.get(IncomingBatch.fold(name));
  }

  /** The campers' bunks in this season's runs, by run Id + '|' + camper Id. */
  public Map<String, Preference__c> bunksOf(Set<Id> camperIds) {
    Map<String, Preference__c> result = new Map<String, Preference__c>();
    Set<Id> runIds = new Map<Id, ElectiveRun__c>(runs).keySet();
    for (Preference__c row : [
      SELECT Id, ElectiveRun__c, Camper__c, Group__c
      FROM Preference__c
      WHERE ElectiveRun__c IN :runIds AND Camper__c IN :camperIds
      WITH USER_MODE
    ]) {
      result.put(row.ElectiveRun__c + '|' + row.Camper__c, row);
    }
    return result;
  }

  /** The campers' choices in this season's runs, by run Id + '|' + camper Id. */
  public Map<String, Preference__c> choicesOf(Set<Id> camperIds) {
    Map<String, Preference__c> result = new Map<String, Preference__c>();
    Set<Id> runIds = new Map<Id, ElectiveRun__c>(runs).keySet();
    for (Preference__c row : [
      SELECT
        Id,
        ElectiveRun__c,
        Camper__c,
        Choices__c,
        ImportedChoices__c,
        ManualChange__c,
        ChoicesChangedAt__c
      FROM Preference__c
      WHERE ElectiveRun__c IN :runIds AND Camper__c IN :camperIds
      WITH USER_MODE
    ]) {
      result.put(row.ElectiveRun__c + '|' + row.Camper__c, row);
    }
    return result;
  }

  /**
   * API-6.4: whether the season has a week of this name (and an elective set of that name, when
   * one is given), though no run: nothing was brought in there yet.
   */
  public Boolean notStarted(Id seasonId, String electiveSet, String week) {
    if (String.isBlank(week)) {
      return false;
    }
    if (weekNames == null) {
      weekNames = new Set<String>();
      for (Week__c item : [
        SELECT Name
        FROM Week__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
      ]) {
        weekNames.add(IncomingBatch.fold(item.Name));
      }
    }
    if (!weekNames.contains(IncomingBatch.fold(week))) {
      return false;
    }
    if (electiveSet == null) {
      return true;
    }
    // Read only when a set is named: a key that sends bunks reads no sets.
    if (setNames == null) {
      setNames = new Set<String>();
      for (ElectiveSet__c item : [
        SELECT Name
        FROM ElectiveSet__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
      ]) {
        setNames.add(IncomingBatch.fold(item.Name));
      }
    }
    return setNames.contains(IncomingBatch.fold(electiveSet));
  }

  private static Boolean same(String saved, String sent) {
    return String.isNotBlank(sent) &&
      IncomingBatch.fold(saved) == IncomingBatch.fold(sent);
  }
}
