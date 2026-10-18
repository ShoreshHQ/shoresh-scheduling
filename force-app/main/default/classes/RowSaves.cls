/**
 * One setup table row, saved as the director leaves it (ADR 0011). Compare and set, row by row,
 * in the spirit of Manual Build's slot saves (ADR 0008 §4): the screen sends what the row held
 * when the director saw it (`seen`, the changed fields only) and what it should hold (`record`).
 * If someone else changed one of those fields since, nothing is saved and the answer says which
 * fields and what they hold now, so the screen can ask "Keep theirs" or "Use yours". Fields
 * the director did not change are never sent, so someone else's change to them stays.
 * "Runs in" ticks need no check: a tick says what the director wants, and saving it twice is
 * the same as once. Who a recurring activity covers is checked like a field.
 */
public with sharing class RowSaves {
  /** What became of a row save: its Id, or what someone else changed. */
  public class Result {
    @AuraEnabled
    public Id id;
    /** The fields someone else changed, named as the screen sent them. */
    @AuraEnabled
    public List<String> changed = new List<String>();
    /** The row as it is now: those fields' values. */
    @AuraEnabled
    public SObject theirs;
    /** Who the row covers now, when someone else changed it. */
    @AuraEnabled
    public List<Id> theirWho;

    public Boolean saved() {
      return changed.isEmpty() && theirWho == null;
    }
  }

  /**
   * Saves the row unless someone else changed what the director changed. A new row (no Id) has
   * nothing to compare. extras.seenWho is who a recurring activity covered when the director
   * changed it (null when they didn't).
   */
  public static Result save(
    SObject record,
    SObject seen,
    ScreenSaves.Extras extras
  ) {
    if (record == null) {
      throw ScreenErrors.of('These screens can\'t save that.');
    }
    // Only fields the screens save are compared (and so read back as theirs).
    ScreenSaves.refuseWhatCannotBeSaved(new List<SObject>{ record });
    // Week ticks and who it covers are for this row only.
    RowExtras.refuseOtherRows(record, extras);
    Savepoint beforeSave = Database.setSavepoint();
    try {
      Result result = record.Id == null
        ? new Result()
        : compare(record, seen, extras);
      if (result.saved()) {
        result.id = ScreenSaves.save(new List<SObject>{ record }, extras)[0];
      }
      return result;
    } catch (Exception e) {
      Database.rollback(beforeSave);
      throw ScreenErrors.of(e);
    }
  }

  /** Locks the row and compares each field the director changed with what it holds now. */
  private static Result compare(
    SObject record,
    SObject seen,
    ScreenSaves.Extras extras
  ) {
    Map<String, Schema.SObjectField> compared = RowSeen.comparedFields(
      record,
      seen
    );
    SObject now = RowSeen.lockedNow(record, compared.values(), seen);
    Result result = new Result();
    for (String name : compared.keySet()) {
      Schema.SObjectField field = compared.get(name);
      if (
        !RowSeen.stillAsSeen(seen.get(field), now.get(field), record.get(field))
      ) {
        result.changed.add(name);
        result.theirs = now;
      }
    }
    List<Id> seenWho = extras == null ? null : extras.seenWho;
    if (seenWho != null) {
      List<Id> who = RowSeen.whoNow(record);
      // Unchanged since, or someone else chose the same: no question.
      List<Id> wanted = RowExtras.wantedWho(extras);
      if (
        !RowSeen.sameIds(seenWho, who) &&
        (wanted == null || !RowSeen.sameIds(wanted, who))
      ) {
        result.theirWho = who;
        result.theirs = now;
      }
    }
    return result;
  }
}
