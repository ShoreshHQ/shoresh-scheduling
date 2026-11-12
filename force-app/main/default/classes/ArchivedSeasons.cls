/**
 * An archived season is read-only (WEEK-1.10; ADR 0029): every insert, change or delete of a
 * record inside it is refused with "<season> is archived", whoever makes it (a screen, an AI, an
 * import, a record page, the API), and nothing is changed. Every before trigger of a season's
 * records calls refuseChanges() first. Which seasons are archived is read once per request; with
 * none archived nothing more is read. Bringing a season back (SeasonArchive) is the only change an
 * archived season takes (SeasonTriggerHandler).
 *
 * System mode on purpose: the protection holds whoever can reach the records, and only which
 * season a record is in is read.
 */
public with sharing class ArchivedSeasons {
  // Archived seasons, id -> name; null until first read in this request.
  private static Map<Id, String> archived;
  // A record -> its season, kept for the request (a record never moves to another season).
  private static Map<Id, Id> seasonOfRecord = new Map<Id, Id>();

  // Records that name their season. Imports and sends are logs of what came and went, not the
  // season's contents, so they are left out.
  private static final Map<Schema.SObjectType, Schema.SObjectField> SEASON_FIELD = new Map<Schema.SObjectType, Schema.SObjectField>{
    Activity__c.SObjectType => Activity__c.Season__c,
    Camper__c.SObjectType => Camper__c.Season__c,
    Coverage__c.SObjectType => Coverage__c.Season__c,
    ElectiveRun__c.SObjectType => ElectiveRun__c.Season__c,
    ElectiveSet__c.SObjectType => ElectiveSet__c.Season__c,
    LocationType__c.SObjectType => LocationType__c.Season__c,
    Location__c.SObjectType => Location__c.Season__c,
    PlanPart__c.SObjectType => PlanPart__c.Season__c,
    Program__c.SObjectType => Program__c.Season__c,
    SpecialDate__c.SObjectType => SpecialDate__c.Season__c,
    SpecialDay__c.SObjectType => SpecialDay__c.Season__c,
    SpecialEvent__c.SObjectType => SpecialEvent__c.Season__c,
    Week__c.SObjectType => Week__c.Season__c
  };

  // Records whose season is their parent's, through this lookup.
  private static final Map<Schema.SObjectType, Schema.SObjectField> PARENT_FIELD = new Map<Schema.SObjectType, Schema.SObjectField>{
    Division__c.SObjectType => Division__c.Program__c,
    Group__c.SObjectType => Group__c.Division__c,
    TimeBlock__c.SObjectType => TimeBlock__c.Program__c,
    FixedActivity__c.SObjectType => FixedActivity__c.Program__c,
    RecurringActivity__c.SObjectType => RecurringActivity__c.Program__c,
    Schedule__c.SObjectType => Schedule__c.Program__c,
    ScheduleDay__c.SObjectType => ScheduleDay__c.Schedule__c,
    PublishedPlan__c.SObjectType => PublishedPlan__c.Schedule__c,
    WeekException__c.SObjectType => WeekException__c.Week__c,
    ActivityEligibility__c.SObjectType => ActivityEligibility__c.Activity__c,
    Offering__c.SObjectType => Offering__c.ElectiveSet__c,
    LinkedChoice__c.SObjectType => LinkedChoice__c.ElectiveSet__c,
    LinkedChoiceTime__c.SObjectType => LinkedChoiceTime__c.LinkedChoice__c,
    Assignment__c.SObjectType => Assignment__c.ElectiveRun__c,
    Preference__c.SObjectType => Preference__c.ElectiveRun__c
  };

  /**
   * Called first in a before trigger of a season's records: each row inside an archived season
   * (on a change, before or after it) is refused.
   */
  public static void refuseChanges() {
    refuse(
      Trigger.isDelete ? Trigger.old : Trigger.new,
      Trigger.isUpdate ? Trigger.old : null
    );
  }

  /** Refuses each row (or its value before a change, olds) inside an archived season. */
  @TestVisible
  private static void refuse(List<SObject> rows, List<SObject> olds) {
    if (archived().isEmpty()) {
      return;
    }
    Map<Id, Id> parents = seasonsOfParents(rows, olds);
    for (Integer i = 0; i < rows.size(); i++) {
      Id season = seasonOf(rows[i], parents);
      if (!archived.containsKey(season) && olds != null) {
        season = seasonOf(olds[i], parents);
      }
      if (archived.containsKey(season)) {
        rows[i].addError(refusal(archived.get(season)));
      }
    }
  }

  /** Why this record can't be changed (it is in an archived season, or is one), or null. */
  public static String refusalFor(Id recordId) {
    if (recordId == null || archived().isEmpty()) {
      return null;
    }
    Id season = recordId.getSObjectType() == Season__c.SObjectType
      ? recordId
      : seasonsOf(new Set<Id>{ recordId }).get(recordId);
    return archived.containsKey(season) ? refusal(archived.get(season)) : null;
  }

  /** Whether the season is archived. */
  public static Boolean isArchived(Id seasonId) {
    return archived().containsKey(seasonId);
  }

  /** "Summer 2025" is archived, so it can't be changed. (A screen adds what to do.) */
  public static String refusal(String seasonName) {
    return AgentRefusal.withFix(
      '"' + seasonName + '" is archived, so it can\'t be changed.',
      'Bring it back first.'
    );
  }

  /**
   * Seasons were made, changed, deleted or restored (before: their values before, or null). Which
   * are archived is read again when next asked only if one of them is or was archived; any other
   * season save keeps what was read, so a request that makes a season reads nothing more.
   */
  public static void seasonsSaved(
    List<Season__c> seasons,
    Map<Id, Season__c> before
  ) {
    for (Season__c season : seasons) {
      Season__c was = before?.get(season.Id);
      if (season.Archived__c || was?.Archived__c == true) {
        archived = null;
        return;
      }
    }
  }

  private static Map<Id, String> archived() {
    if (archived == null) {
      archived = new Map<Id, String>();
      for (Season__c season : [
        SELECT Id, Name
        FROM Season__c
        WHERE Archived__c = TRUE
        WITH SYSTEM_MODE
      ]) {
        archived.put(season.Id, season.Name);
      }
    }
    return archived;
  }

  private static Id seasonOf(SObject row, Map<Id, Id> parents) {
    Schema.SObjectType kind = row.getSObjectType();
    if (SEASON_FIELD.containsKey(kind)) {
      return (Id) row.get(SEASON_FIELD.get(kind));
    }
    return parents.get((Id) row.get(PARENT_FIELD.get(kind)));
  }

  /** The season of each parent the rows name (none for rows that name their season). */
  private static Map<Id, Id> seasonsOfParents(
    List<SObject> rows,
    List<SObject> olds
  ) {
    Schema.SObjectField parentField = PARENT_FIELD.get(rows.getSObjectType());
    Set<Id> parentIds = new Set<Id>();
    if (parentField != null) {
      for (SObject row : rows) {
        parentIds.add((Id) row.get(parentField));
      }
      for (SObject row : olds ?? new List<SObject>()) {
        parentIds.add((Id) row.get(parentField));
      }
    }
    parentIds.remove(null);
    return seasonsOf(parentIds);
  }

  /** Each record's season (records of one kind), read once per request. */
  private static Map<Id, Id> seasonsOf(Set<Id> recordIds) {
    Set<Id> unknown = new Set<Id>(recordIds);
    unknown.removeAll(seasonOfRecord.keySet());
    if (!unknown.isEmpty()) {
      Schema.SObjectType kind = new List<Id>(unknown)[0].getSObjectType();
      String query =
        'SELECT Id, ' +
        pathToSeason(kind) +
        ' FROM ' +
        ShoreshSchema.queryName(kind) +
        ' WHERE Id IN :unknown';
      for (
        SObject record : Database.queryWithBinds(
          query,
          new Map<String, Object>{ 'unknown' => unknown },
          AccessLevel.SYSTEM_MODE
        )
      ) {
        seasonOfRecord.put(record.Id, seasonIn(record));
      }
    }
    Map<Id, Id> result = new Map<Id, Id>();
    for (Id recordId : recordIds) {
      result.put(recordId, seasonOfRecord.get(recordId));
    }
    return result;
  }

  /**
   * The relationship path from a kind of record to its season, as the package names it (read from
   * the schema, so it holds under the namespace): "Division__r.Program__r.Season__c".
   */
  private static String pathToSeason(Schema.SObjectType kind) {
    List<String> path = new List<String>();
    Schema.SObjectType at = kind;
    while (!SEASON_FIELD.containsKey(at)) {
      Schema.DescribeFieldResult up = PARENT_FIELD.get(at).getDescribe();
      path.add(up.getRelationshipName());
      at = up.getReferenceTo()[0];
    }
    path.add(ShoreshSchema.queryName(SEASON_FIELD.get(at)));
    return String.join(path, '.');
  }

  /** The season a record read by pathToSeason holds, walking up its parents. */
  private static Id seasonIn(SObject record) {
    SObject at = record;
    while (!SEASON_FIELD.containsKey(at.getSObjectType())) {
      at = at.getSObject(PARENT_FIELD.get(at.getSObjectType()));
      if (at == null) {
        return null;
      }
    }
    return (Id) at.get(SEASON_FIELD.get(at.getSObjectType()));
  }
}
