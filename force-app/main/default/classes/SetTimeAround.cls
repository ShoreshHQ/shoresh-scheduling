/**
 * CORE-3.9: a fixed activity saved over a recurring activity, answered "<recurring>, not at
 * <time block>": the recurring activity keeps its other time blocks, in the same save as the fixed
 * activity, so the clash check (held to the end of the write, SetupWrite) sees both. Its first
 * piece is the recurring activity itself; each further piece is a copy with the same days,
 * location, who it covers, and weeks.
 */
public with sharing class SetTimeAround {
  /** One run of time blocks a recurring activity keeps. */
  public class Piece {
    @AuraEnabled
    public Id target { get; set; }
    @AuraEnabled
    public Id timeBlock { get; set; }
    @AuraEnabled
    public Integer length { get; set; }
    /** The recurring activity as the screen showed it: refused if someone changed it since. */
    @AuraEnabled
    public String seenName { get; set; }
    @AuraEnabled
    public Id seenTimeBlock { get; set; }
    @AuraEnabled
    public Integer seenLength { get; set; }
  }

  /** Only with one fixed activity's save: nothing else is saved over a recurring activity. */
  public static void split(List<SObject> rows, List<Piece> pieces) {
    if (pieces == null || pieces.isEmpty()) {
      return;
    }
    if (
      rows.size() != 1 ||
      rows[0].getSObjectType() != FixedActivity__c.SObjectType
    ) {
      throw ScreenErrors.of('These screens can\'t save that.');
    }
    Map<Id, List<Piece>> byTarget = new Map<Id, List<Piece>>();
    for (Piece piece : pieces) {
      if (piece.target == null || piece.timeBlock == null) {
        throw ScreenErrors.of('These screens can\'t save that.');
      }
      if (!byTarget.containsKey(piece.target)) {
        byTarget.put(piece.target, new List<Piece>());
      }
      byTarget.get(piece.target).add(piece);
    }
    Set<Id> targets = byTarget.keySet();
    List<SObject> changed = new List<SObject>();
    Map<Id, List<RecurringActivity__c>> copiesOf = new Map<Id, List<RecurringActivity__c>>();
    for (RecurringActivity__c item : [
      SELECT
        Id,
        Name,
        Program__c,
        TimeBlock__c,
        Length__c,
        Location__c,
        Monday__c,
        Tuesday__c,
        Wednesday__c,
        Thursday__c,
        Friday__c,
        Saturday__c,
        Sunday__c,
        SortOrder__c
      FROM RecurringActivity__c
      WHERE Id IN :targets
      WITH USER_MODE
    ]) {
      List<Piece> runs = byTarget.get(item.Id);
      Piece seen = runs[0];
      if (
        item.TimeBlock__c != seen.seenTimeBlock ||
        (item.Length__c == null ? 1 : item.Length__c.intValue()) !=
        seen.seenLength
      ) {
        throw ScreenErrors.of(
          '"' +
            item.Name +
            '" was changed by someone else since you saw it. Nothing was saved; save again to see it as it is now.'
        );
      }
      changed.add(
        new RecurringActivity__c(
          Id = item.Id,
          TimeBlock__c = runs[0].timeBlock,
          Length__c = lengthOf(runs[0])
        )
      );
      List<RecurringActivity__c> copies = new List<RecurringActivity__c>();
      for (Integer i = 1; i < runs.size(); i++) {
        RecurringActivity__c copy = item.clone(false, true, false, false);
        copy.TimeBlock__c = runs[i].timeBlock;
        copy.Length__c = lengthOf(runs[i]);
        copies.add(copy);
        changed.add(copy);
      }
      copiesOf.put(item.Id, copies);
    }
    for (Id target : targets) {
      if (!copiesOf.containsKey(target)) {
        String name = byTarget.get(target)[0].seenName;
        throw ScreenErrors.of(
          (String.isBlank(name) ? 'That' : '"' + name + '"') +
          ' is no longer there. Nothing was saved.'
        );
      }
    }
    UserModeWrites.save(changed);
    UserModeWrites.save(coverageOf(copiesOf));
    WeekExceptions.save(weeksOffOf(copiesOf), null);
  }

  private static Integer lengthOf(Piece piece) {
    return piece.length == null || piece.length < 1 ? 1 : piece.length;
  }

  /** Who each original covers, for each of its copies. */
  private static List<SObject> coverageOf(
    Map<Id, List<RecurringActivity__c>> copiesOf
  ) {
    Set<Id> sources = copiesOf.keySet();
    List<SObject> rows = new List<SObject>();
    for (Coverage__c row : [
      SELECT RecurringActivity__c, Season__c, Division__c, Group__c
      FROM Coverage__c
      WHERE RecurringActivity__c IN :sources
      WITH USER_MODE
    ]) {
      for (RecurringActivity__c copy : copiesOf.get(row.RecurringActivity__c)) {
        rows.add(
          new Coverage__c(
            Season__c = row.Season__c,
            RecurringActivity__c = copy.Id,
            Division__c = row.Division__c,
            Group__c = row.Group__c
          )
        );
      }
    }
    return rows;
  }

  /** The weeks each original is off, for each of its copies. */
  private static List<WeekException__c> weeksOffOf(
    Map<Id, List<RecurringActivity__c>> copiesOf
  ) {
    Set<Id> sources = copiesOf.keySet();
    List<WeekException__c> rows = new List<WeekException__c>();
    for (WeekException__c mark : [
      SELECT RecurringActivity__c, Week__c
      FROM WeekException__c
      WHERE RecurringActivity__c IN :sources
      WITH USER_MODE
    ]) {
      for (
        RecurringActivity__c copy : copiesOf.get(mark.RecurringActivity__c)
      ) {
        rows.add(
          new WeekException__c(
            RecurringActivity__c = copy.Id,
            Week__c = mark.Week__c
          )
        );
      }
    }
    return rows;
  }
}
