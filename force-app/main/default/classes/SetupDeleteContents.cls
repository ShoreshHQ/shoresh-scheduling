/**
 * What goes with a deleted week or program, for SetupDelete's question: its Manual Builds,
 * Generated Schedules and saved versions (ADR 0005 §10, ADR 0008; Schedule__c.Program__c is
 * master-detail), and for a week the special days and events it takes off its days (ADR 0014
 * choice 9; the items stay saved). In user mode; what the person can't read is left out, as the
 * screens leave it out.
 */
public with sharing class SetupDeleteContents {
  private static final Set<Schema.SObjectType> HAS_SCHEDULES = new Set<Schema.SObjectType>{
    Week__c.SObjectType,
    Program__c.SObjectType
  };
  private static final List<Schema.SObjectType> SCHEDULES = new List<Schema.SObjectType>{
    Schedule__c.SObjectType
  };
  private static final List<Schema.SObjectType> SPECIALS = new List<Schema.SObjectType>{
    SpecialDate__c.SObjectType,
    SpecialDay__c.SObjectType,
    SpecialEvent__c.SObjectType
  };

  /**
   * For a week or program: ' That includes its Manual Build, 2 Generated Schedules and 3 saved
   * versions.', or '' when none.
   */
  public static String savedSchedules(Id recordId) {
    if (
      !HAS_SCHEDULES.contains(recordId.getSObjectType()) || !canRead(SCHEDULES)
    ) {
      return '';
    }
    Map<String, Integer> counts = new Map<String, Integer>{
      'Version' => 0,
      'Manual' => 0,
      'Generated' => 0
    };
    Id campId = countInto(recordId, counts);
    if (campId == null) {
      return '';
    }
    CampLabels labels = CampLabels.forCamp(campId);
    List<String> parts = new List<String>();
    for (
      String part : new List<String>{
        counted(counts.get('Manual'), 'its Manual Build', ' Manual Builds'),
        counted(
          counts.get('Generated'),
          'its Generated Schedule',
          ' Generated Schedules'
        ),
        counted(
          counts.get('Version'),
          '1 saved ' + labels.singularInSentence('Version'),
          ' saved ' + labels.pluralInSentence('Version')
        )
      }
    ) {
      if (part != '') {
        parts.add(part);
      }
    }
    return parts.isEmpty() ? '' : ' That includes ' + andList(parts) + '.';
  }

  /** "its Manual Build" for one, "2 Manual Builds" for more, '' for none. */
  private static String counted(Integer count, String one, String many) {
    return count == 0 ? '' : count == 1 ? one : count + many;
  }

  /**
   * Counts the record's schedules as "Version", "Manual" (a Manual Build) or "Generated"; returns
   * their camp.
   */
  private static Id countInto(Id recordId, Map<String, Integer> counts) {
    Id campId;
    for (Schedule__c row : [
      SELECT Status__c, Origin__c, Program__r.Season__r.Camp__c
      FROM Schedule__c
      WHERE Week__c = :recordId OR Program__c = :recordId
      WITH USER_MODE
    ]) {
      campId = row.Program__r.Season__r.Camp__c;
      String kind = row.Status__c == 'Draft' ? row.Origin__c : row.Status__c;
      if (counts.containsKey(kind)) {
        counts.put(kind, counts.get(kind) + 1);
      }
    }
    return campId;
  }

  /**
   * For a week: ' It takes "Field Day" off Tuesday and "Carnival" off Wednesday and Thursday.',
   * special days first, then events, each in the Special events screen's order; '' when none.
   */
  public static String specialDaysTakenOff(Id weekId) {
    if (weekId.getSObjectType() != Week__c.SObjectType) {
      return '';
    }
    // Read as the Special events screen reads them; someone who can't sees none.
    if (!canRead(SPECIALS)) {
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
      List<String> days = daysOf.containsKey(itemId)
        ? daysOf.get(itemId)
        : new List<String>();
      days.add(row.Day__c);
      daysOf.put(itemId, days);
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

  private static Boolean canRead(List<Schema.SObjectType> types) {
    for (Schema.SObjectType type : types) {
      if (!type.getDescribe().isAccessible()) {
        return false;
      }
    }
    return true;
  }
}
