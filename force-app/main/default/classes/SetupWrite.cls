/**
 * One setup write, and the checks that go with it. A caller says what it is writing (Kind) and
 * hands over its steps; this holds the fixed and recurring activity clash check (SetTimeGuard)
 * until every step is done, runs it, and undoes the whole write if a step or the check refuses.
 * No caller defers, checks, or turns off a trigger's rule itself.
 *
 *   1. SAVE: a screen, import, or merge save. Checked once, at the end.
 *   2. COPY: a season copied. Checked at the end; rain plans are kept as the season had them,
 *      even one made outdoors since (ActivityTriggerHandler).
 *   3. RESTORE: an Undo putting records back. Checked at the end; rain plans are put back as
 *      they were (ADR 0006 §18), and so is a fixed or recurring activity's last time block, so a
 *      "changed blocks" note it had comes back with it (SetTimeItemTriggerHandler). A record it
 *      deletes keeps its week-off marks: one marked since is kept as in use (ImportUndoDeletes).
 *   4. OWN_ROWS: a season's or a record's own rows going with it as it is deleted, however it is
 *      deleted (a screen, a record page, a Flow, Data Loader): a season's setup, or a group's,
 *      activity's, location's, or fixed or recurring activity's week-off marks and a recurring
 *      activity's who-it-covers rows (WeekExceptions.goWith). Nothing left behind can clash, so
 *      nothing is checked, and the delete itself is the platform's, all or none. Not inside a
 *      RESTORE (rule 3), nor inside a season's delete, which has cleared them already.
 *
 * Writes inside another take part in the outer one: it checks once, when it is done.
 */
public with sharing class SetupWrite {
  public enum Kind {
    SAVE,
    COPY,
    RESTORE,
    OWN_ROWS
  }

  /** What a caller writes. */
  public interface Steps {
    void write();
  }

  private static List<Kind> open = new List<Kind>();

  public static void run(Kind writing, Steps steps) {
    SetTimeGuard.defer();
    open.add(writing);
    Savepoint before = writing == Kind.OWN_ROWS
      ? null
      : Database.setSavepoint();
    try {
      steps.write();
      if (writing != Kind.OWN_ROWS) {
        SetTimeGuard.checkPending();
      }
    } catch (Exception e) {
      if (before != null) {
        Database.rollback(before);
      }
      throw e;
    } finally {
      open.remove(open.size() - 1);
      SetTimeGuard.resume();
    }
  }

  /** Rules 2 and 3: rain plans are put back as they were, not checked again. */
  public static Boolean keepsRainPlans() {
    return open.contains(Kind.COPY) || open.contains(Kind.RESTORE);
  }

  /** Rule 4: a deleted record's own rows go with it, unless rule 3 or a season's delete has them. */
  public static Boolean clearsOwnRows() {
    return !open.contains(Kind.RESTORE) && !open.contains(Kind.OWN_ROWS);
  }

  /** Rule 3: a fixed or recurring activity's last time block is put back as it was. */
  public static Boolean keepsLastTimeBlocks() {
    return open.contains(Kind.RESTORE);
  }
}
