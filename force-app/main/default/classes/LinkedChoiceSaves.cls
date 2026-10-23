/**
 * The linked choices editor's saves (electives slice E8; repo ADR 0018 choices 38 to 44; desktop
 * BundleEditor.jsx and ElectiveSetDetail.jsx). Each gesture is one save, as the desktop writes
 * each click: a linked choice made with its first period, its name, who it applies to, a period
 * ticked or unticked, a division ticked or unticked. A change says only what it changes, so a
 * period ticked twice is the same as once and two people ticking different periods never undo
 * each other. All or none, in user mode; LinkedChoiceTriggers keep the rows inside the season.
 */
public with sharing class LinkedChoiceSaves {
  public static final Set<String> APPLIES_TO = new Set<String>{
    'All',
    'OnlyThese',
    'AllExcept'
  };
  private static final Set<String> WEEKDAYS = new Set<String>{
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday'
  };

  /** What one gesture changes. Blank parts are left as they are. */
  public class Edit {
    // The linked choice; blank for a new one, made under offeringId.
    public Id id;
    public Id offeringId;
    public String name;
    public String appliesTo;
    public List<Period> periodsOn = new List<Period>();
    public List<Period> periodsOff = new List<Period>();
    public List<Id> divisionsOn = new List<Id>();
    public List<Id> divisionsOff = new List<Id>();
  }

  /** A period of the week: a weekday and a time block. */
  public class Period {
    public String weekday;
    public Id blockId;
  }

  /** Saves one gesture; returns the linked choice's Id. */
  public static Id save(Edit edit) {
    if (edit == null || (edit.id == null && edit.offeringId == null)) {
      throw new ShoreshException('That change could not be sent. Try again.');
    }
    refuseUnknownValues(edit);
    Savepoint before = Database.setSavepoint();
    try {
      LinkedChoice__c choice = edit.id == null ? made(edit) : changed(edit);
      savePeriods(choice, edit);
      saveDivisions(choice, edit);
      return choice.Id;
    } catch (Exception e) {
      Database.rollback(before);
      throw e;
    }
  }

  private static void refuseUnknownValues(Edit edit) {
    if (edit.appliesTo != null && !APPLIES_TO.contains(edit.appliesTo)) {
      throw new ShoreshException('That change could not be sent. Try again.');
    }
    for (Period each : periodsOf(edit.periodsOn)) {
      if (!WEEKDAYS.contains(each.weekday) || each.blockId == null) {
        throw new ShoreshException('That period could not be sent. Try again.');
      }
    }
  }

  /** A new linked choice of the offering, after the set's others. */
  private static LinkedChoice__c made(Edit edit) {
    List<Offering__c> found = [
      SELECT Id, ElectiveSet__c, ElectiveSet__r.Season__r.Camp__c
      FROM Offering__c
      WHERE Id = :edit.offeringId
      WITH USER_MODE
    ];
    if (found.isEmpty()) {
      throw new ShoreshException(
        'That offering is no longer there. Reload the page.'
      );
    }
    Offering__c offering = found[0];
    refuseBlankName(edit.name, offering.ElectiveSet__r.Season__r.Camp__c);
    List<AggregateResult> most = [
      SELECT MAX(SortOrder__c) highest
      FROM LinkedChoice__c
      WHERE ElectiveSet__c = :offering.ElectiveSet__c
      WITH USER_MODE
    ];
    Decimal highest = (Decimal) most[0].get('highest');
    LinkedChoice__c choice = new LinkedChoice__c(
      ElectiveSet__c = offering.ElectiveSet__c,
      Offering__c = offering.Id,
      Name = edit.name.trim(),
      AppliesTo__c = edit.appliesTo == null ? 'All' : edit.appliesTo,
      SortOrder__c = highest == null ? 1 : highest + 1
    );
    Database.insert(choice, AccessLevel.USER_MODE);
    return held(choice.Id);
  }

  /** The linked choice with its name and who it applies to as the gesture says. */
  private static LinkedChoice__c changed(Edit edit) {
    LinkedChoice__c choice = held(edit.id);
    LinkedChoice__c changes = new LinkedChoice__c(Id = choice.Id);
    Boolean changing = false;
    if (edit.name != null) {
      refuseBlankName(edit.name, choice.ElectiveSet__r.Season__r.Camp__c);
      changes.Name = edit.name.trim();
      changing = true;
    }
    if (edit.appliesTo != null) {
      changes.AppliesTo__c = edit.appliesTo;
      changing = true;
    }
    if (changing) {
      Database.update(changes, AccessLevel.USER_MODE);
    }
    return choice;
  }

  /**
   * The linked choice, its periods and divisions, held for this save: two saves of one linked
   * choice take turns, so a period ticked by both is added once.
   */
  private static LinkedChoice__c held(Id choiceId) {
    if (
      [
          SELECT Id
          FROM LinkedChoice__c
          WHERE Id = :choiceId
          WITH USER_MODE
          FOR UPDATE
        ]
        .isEmpty()
    ) {
      throw new ShoreshException(
        'That linked choice is no longer there. Reload the page.'
      );
    }
    return [
      SELECT
        Id,
        ElectiveSet__r.Season__c,
        ElectiveSet__r.Season__r.Camp__c,
        (SELECT Id, Weekday__c, TimeBlock__c FROM Times__r),
        (SELECT Id, Division__c FROM Coverages__r)
      FROM LinkedChoice__c
      WHERE Id = :choiceId
      WITH USER_MODE
    ];
  }

  /** A linked choice's name is what a sheet says, so it can't be blank. */
  private static void refuseBlankName(String name, Id campId) {
    if (String.isBlank(name)) {
      CampLabels labels = CampLabels.forCamp(campId);
      throw new ShoreshException(
        'Give the ' +
          labels.singularInSentence('LinkedChoice') +
          ' a name: it is what a sheet says to choose it.'
      );
    }
  }

  /** Periods ticked are added once; periods unticked are removed. */
  private static void savePeriods(LinkedChoice__c choice, Edit edit) {
    Map<String, List<LinkedChoiceTime__c>> had = new Map<String, List<LinkedChoiceTime__c>>();
    for (LinkedChoiceTime__c row : choice.Times__r) {
      String key = keyOf(row.Weekday__c, row.TimeBlock__c);
      if (!had.containsKey(key)) {
        had.put(key, new List<LinkedChoiceTime__c>());
      }
      had.get(key).add(row);
    }
    List<LinkedChoiceTime__c> removes = new List<LinkedChoiceTime__c>();
    for (Period each : periodsOf(edit.periodsOff)) {
      List<LinkedChoiceTime__c> rows = had.remove(
        keyOf(each.weekday, each.blockId)
      );
      if (rows != null) {
        removes.addAll(rows);
      }
    }
    List<LinkedChoiceTime__c> adds = new List<LinkedChoiceTime__c>();
    for (Period each : periodsOf(edit.periodsOn)) {
      String key = keyOf(each.weekday, each.blockId);
      if (!had.containsKey(key)) {
        had.put(key, new List<LinkedChoiceTime__c>());
        adds.add(
          new LinkedChoiceTime__c(
            LinkedChoice__c = choice.Id,
            Weekday__c = each.weekday,
            TimeBlock__c = each.blockId
          )
        );
      }
    }
    Database.delete(removes, true, AccessLevel.USER_MODE);
    Database.insert(adds, true, AccessLevel.USER_MODE);
  }

  /** Divisions ticked are added once; divisions unticked are removed. */
  private static void saveDivisions(LinkedChoice__c choice, Edit edit) {
    Map<Id, List<Coverage__c>> had = new Map<Id, List<Coverage__c>>();
    for (Coverage__c row : choice.Coverages__r) {
      if (!had.containsKey(row.Division__c)) {
        had.put(row.Division__c, new List<Coverage__c>());
      }
      had.get(row.Division__c).add(row);
    }
    List<Coverage__c> removes = new List<Coverage__c>();
    for (Id divisionId : idsOf(edit.divisionsOff)) {
      List<Coverage__c> rows = had.remove(divisionId);
      if (rows != null) {
        removes.addAll(rows);
      }
    }
    List<Coverage__c> adds = new List<Coverage__c>();
    for (Id divisionId : idsOf(edit.divisionsOn)) {
      if (divisionId != null && !had.containsKey(divisionId)) {
        had.put(divisionId, new List<Coverage__c>());
        adds.add(
          new Coverage__c(
            Season__c = choice.ElectiveSet__r.Season__c,
            LinkedChoice__c = choice.Id,
            Division__c = divisionId
          )
        );
      }
    }
    Database.delete(removes, true, AccessLevel.USER_MODE);
    Database.insert(adds, true, AccessLevel.USER_MODE);
  }

  private static String keyOf(String weekday, Id blockId) {
    return weekday + '|' + blockId;
  }

  private static List<Period> periodsOf(List<Period> periods) {
    return periods == null ? new List<Period>() : periods;
  }

  private static List<Id> idsOf(List<Id> ids) {
    return ids == null ? new List<Id>() : ids;
  }
}
