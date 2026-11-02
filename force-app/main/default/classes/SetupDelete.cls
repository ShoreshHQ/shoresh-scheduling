/**
 * Deleting one of a season's setup records, for Camp Setup and for the person's AI alike: what
 * stops the delete, what the question before it says (everything that goes with the record), and
 * the delete itself. The screen and the AI both ask with preview() and delete with remove(), so
 * they refuse, warn and remember the same way (ADR 0012; build log decisions 15 and 45).
 *
 * The question's words are the ones Camp Setup has always asked with:
 * - an offering: 'Take "Swim" off "Period 1"? The activity is kept.'
 * - a linked choice: 'Delete "Swim double"? A sheet that names it then counts as Swim.'
 * - a bunk or activity some schedule uses (decision 15): 'Bunk 3 is in 2 schedules. Delete
 *   anyway?', with "or more" when the count stopped short, or that it couldn't be counted;
 * - anything else: 'Delete "Week 1"? Anything inside it is deleted too.', then for a week or
 *   program the Manual Builds, Generated Schedules and saved versions that go with it (ADR 0005
 *   §10, ADR 0008; Schedule__c.Program__c is master-detail) and for a week the special days and
 *   events it takes off its days (ADR 0014 choice 9; the items stay saved).
 * Runs in user mode: only what the person can see is counted or named.
 */
public with sharing class SetupDelete {
  // Camps are never deleted from these screens.
  private static final Set<Schema.SObjectType> DELETABLE_TYPES = new Set<Schema.SObjectType>{
    Season__c.SObjectType,
    Week__c.SObjectType,
    Program__c.SObjectType,
    Division__c.SObjectType,
    Group__c.SObjectType,
    TimeBlock__c.SObjectType,
    LocationType__c.SObjectType,
    Location__c.SObjectType,
    Activity__c.SObjectType,
    FixedActivity__c.SObjectType,
    RecurringActivity__c.SObjectType,
    SpecialDay__c.SObjectType,
    SpecialEvent__c.SObjectType,
    ElectiveSet__c.SObjectType,
    Offering__c.SObjectType,
    LinkedChoice__c.SObjectType
  };

  /** What deleting a record would do: why it can't, or the question to ask before it. */
  public class Preview {
    /** Why it can't be deleted yet, in the camp's words; null when nothing is in the way. */
    @AuraEnabled
    public String refusal;
    @AuraEnabled
    public String label = 'Delete';
    @AuraEnabled
    public String message;
    /** How many schedules a bunk or activity is in; none counted for anything else. */
    public ScheduleUses.Count uses = new ScheduleUses.Count();
  }

  public static Preview preview(Id recordId) {
    requireDeletable(recordId);
    Preview result = new Preview();
    result.refusal = InUse.reason(recordId);
    Schema.SObjectType kind = recordId.getSObjectType();
    if (kind == Offering__c.SObjectType) {
      return offering(recordId, result);
    }
    if (kind == LinkedChoice__c.SObjectType) {
      return linkedChoice(recordId, result);
    }
    String name = nameOf(recordId);
    if (kind == Group__c.SObjectType || kind == Activity__c.SObjectType) {
      // A count that couldn't be made is said so, never left out quietly.
      try {
        result.uses = ScheduleUses.count(recordId);
      } catch (Exception e) {
        result.uses.complete = false;
      }
      String used = usedIn(name, result.uses);
      if (used != null) {
        result.label = 'Delete "' + name + '"?';
        result.message = used;
        return result;
      }
    }
    result.message =
      'Delete "' +
      name +
      '"? Anything inside it is deleted too.' +
      savedSchedules(recordId) +
      specialDaysTakenOff(recordId);
    return result;
  }

  /**
   * Deletes the record, all or none, unless something still uses it. A director's delete is
   * remembered first, while its name can still be read, so a later import leaves it out
   * (SetupDeletions); its own unticked weeks go with it (WeekExceptions.deleteWithWeeks).
   */
  public static void remove(Id recordId) {
    requireDeletable(recordId);
    String inUse = InUse.reason(recordId);
    if (inUse != null) {
      throw ScreenErrors.of(inUse);
    }
    // Deleting a time block can move the ones after it: fixed and recurring activities that
    // span it are checked once the delete is done, and a clash undoes it.
    SetTimeGuard.defer();
    Savepoint beforeDelete = Database.setSavepoint();
    try {
      SetupDeletions.remember(recordId);
      WeekExceptions.deleteWithWeeks(recordId);
      SetTimeGuard.checkPending();
    } catch (Exception e) {
      Database.rollback(beforeDelete);
      throw ScreenErrors.of(e);
    } finally {
      SetTimeGuard.resume();
    }
  }

  private static void requireDeletable(Id recordId) {
    if (
      recordId == null || !DELETABLE_TYPES.contains(recordId.getSObjectType())
    ) {
      throw ScreenErrors.of('These screens can\'t delete that.');
    }
  }

  /** An offering is taken off its set; the activity is kept (desktop "Remove …?"). */
  private static Preview offering(Id offeringId, Preview result) {
    for (Offering__c row : [
      SELECT
        Activity__r.Name,
        ElectiveSet__r.Name,
        ElectiveSet__r.Season__r.Camp__c
      FROM Offering__c
      WHERE Id = :offeringId
      WITH USER_MODE
    ]) {
      CampLabels labels = CampLabels.forCamp(
        row.ElectiveSet__r.Season__r.Camp__c
      );
      result.message =
        'Take "' +
        row.Activity__r.Name +
        '" off "' +
        row.ElectiveSet__r.Name +
        '"? The ' +
        labels.singularInSentence('Activity') +
        ' is kept.';
    }
    return result;
  }

  /** A linked choice: a sheet that names it then counts as its offering's activity (slice E8). */
  private static Preview linkedChoice(Id choiceId, Preview result) {
    for (LinkedChoice__c row : [
      SELECT Name, Offering__r.Activity__r.Name
      FROM LinkedChoice__c
      WHERE Id = :choiceId
      WITH USER_MODE
    ]) {
      String activity = row.Offering__r?.Activity__r?.Name;
      result.message =
        'Delete "' +
        row.Name +
        '"?' +
        (activity == null
          ? ''
          : ' A sheet that names it then counts as ' + activity + '.');
    }
    return result;
  }

  /** "Bunk 3 is in 2 schedules. Delete anyway?", or null when no schedule is known to use it. */
  @TestVisible
  private static String usedIn(String name, ScheduleUses.Count uses) {
    if (uses.schedules > 0 && uses.complete) {
      return name +
        ' is in ' +
        uses.schedules +
        (uses.schedules == 1 ? ' schedule' : ' schedules') +
        '. Delete anyway?';
    }
    if (uses.schedules > 0) {
      return name +
        ' is in ' +
        uses.schedules +
        ' or more schedules. Delete anyway?';
    }
    if (!uses.complete) {
      return 'Shoresh couldn\'t count the schedules ' +
        name +
        ' is in. Delete anyway?';
    }
    return null;
  }

  /** The record's name; every deletable kind but an offering has one. */
  private static String nameOf(Id recordId) {
    List<SObject> found = Database.queryWithBinds(
      'SELECT Name FROM ' + recordId.getSObjectType() + ' WHERE Id = :recordId',
      new Map<String, Object>{ 'recordId' => recordId },
      AccessLevel.USER_MODE
    );
    return found.isEmpty() ? '' : (String) found[0].get('Name');
  }

  /**
   * For a week or program: ' That includes its Manual Build, 2 Generated Schedules and 3 saved
   * versions.', or '' when none.
   */
  private static String savedSchedules(Id recordId) {
    Schema.SObjectType kind = recordId.getSObjectType();
    if (kind != Week__c.SObjectType && kind != Program__c.SObjectType) {
      return '';
    }
    Integer builds = 0;
    Integer generated = 0;
    Integer versions = 0;
    Id campId;
    for (Schedule__c row : [
      SELECT Status__c, Origin__c, Program__r.Season__r.Camp__c
      FROM Schedule__c
      WHERE Week__c = :recordId OR Program__c = :recordId
      WITH USER_MODE
    ]) {
      campId = row.Program__r.Season__r.Camp__c;
      if (row.Status__c == 'Version') {
        versions++;
      } else if (row.Status__c == 'Draft' && row.Origin__c == 'Manual') {
        builds++;
      } else if (row.Status__c == 'Draft' && row.Origin__c == 'Generated') {
        generated++;
      }
    }
    List<String> parts = new List<String>();
    if (builds > 0) {
      parts.add(builds == 1 ? 'its Manual Build' : builds + ' Manual Builds');
    }
    if (generated > 0) {
      parts.add(
        generated == 1
          ? 'its Generated Schedule'
          : generated + ' Generated Schedules'
      );
    }
    if (versions > 0) {
      CampLabels labels = CampLabels.forCamp(campId);
      parts.add(
        versions +
          ' saved ' +
          (versions == 1
            ? labels.singularInSentence('Version')
            : labels.pluralInSentence('Version'))
      );
    }
    return parts.isEmpty() ? '' : ' That includes ' + andList(parts) + '.';
  }

  /**
   * For a week: ' It takes "Field Day" off Tuesday and "Carnival" off Wednesday and Thursday.',
   * special days first, then events, each in the Special events screen's order; '' when none.
   */
  private static String specialDaysTakenOff(Id weekId) {
    if (weekId.getSObjectType() != Week__c.SObjectType) {
      return '';
    }
    // Read as the Special events screen reads them; someone who can't sees none.
    if (
      !Schema.sObjectType.SpecialDate__c.isAccessible() ||
      !Schema.sObjectType.SpecialDay__c.isAccessible() ||
      !Schema.sObjectType.SpecialEvent__c.isAccessible()
    ) {
      return '';
    }
    Map<Id, List<String>> daysOf = new Map<Id, List<String>>();
    for (SpecialDate__c row : [
      SELECT Day__c, SpecialDay__c, SpecialEvent__c
      FROM SpecialDate__c
      WHERE Week__c = :weekId
      WITH USER_MODE
      ORDER BY Day__c, Id
    ]) {
      Id itemId = row.SpecialDay__c != null
        ? row.SpecialDay__c
        : row.SpecialEvent__c;
      if (!daysOf.containsKey(itemId)) {
        daysOf.put(itemId, new List<String>());
      }
      daysOf.get(itemId).add(row.Day__c);
    }
    if (daysOf.isEmpty()) {
      return '';
    }
    List<String> off = new List<String>();
    for (SpecialDay__c item : [
      SELECT Id, Name
      FROM SpecialDay__c
      WHERE Id IN :daysOf.keySet()
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name, Id
    ]) {
      off.add('"' + item.Name + '" off ' + andList(daysOf.get(item.Id)));
    }
    for (SpecialEvent__c item : [
      SELECT Id, Name
      FROM SpecialEvent__c
      WHERE Id IN :daysOf.keySet()
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name, Id
    ]) {
      off.add('"' + item.Name + '" off ' + andList(daysOf.get(item.Id)));
    }
    return off.isEmpty() ? '' : ' It takes ' + andList(off) + '.';
  }

  /** "A", "A and B", "A, B and C". */
  private static String andList(List<String> parts) {
    if (parts.size() <= 1) {
      return String.join(parts, '');
    }
    List<String> first = new List<String>(parts);
    String last = first.remove(first.size() - 1);
    return String.join(first, ', ') + ' and ' + last;
  }
}
