/**
 * Saves a schedule's days (ScheduleDay__c), each one grid in one or more parts. A save names the
 * revision each day was opened at; if a day was saved since, the whole save is refused, so two
 * schedulers never overwrite each other unseen. A save across several days and parts writes all
 * of them or none. Runs in user mode.
 */
public with sharing class ScheduleDaySaves {
  public static final String CHANGED_SINCE = 'Someone else changed this schedule since you opened it. Open it again to see their changes, then make yours.';

  /** One day to save. expectedRevision: the revision it was opened at, or null for a new day. */
  public class DaySave {
    public Date day;
    public ScheduleGrid grid;
    public Integer expectedRevision;

    public DaySave(Date day, ScheduleGrid grid, Integer expectedRevision) {
      this.day = day;
      this.grid = grid;
      this.expectedRevision = expectedRevision;
    }
  }

  /** Saves the days, all or none. Refuses a day saved by someone else since it was opened. */
  public static void write(Id scheduleId, List<DaySave> saves) {
    writeAll(new Map<Id, List<DaySave>>{ scheduleId => saves });
  }

  /**
   * Saves several schedules' days at once (an import's versions), all or none: one lock, one
   * read of the days already saved, one write.
   */
  public static void writeAll(Map<Id, List<DaySave>> savesBySchedule) {
    Map<Id, Schedule__c> schedules = new Map<Id, Schedule__c>(
      [
        SELECT
          Id,
          Week__r.Name,
          Week__r.StartDate__c,
          Week__r.EndDate__c,
          Program__r.Season__r.Camp__c
        FROM Schedule__c
        WHERE Id IN :savesBySchedule.keySet()
        WITH USER_MODE
        FOR UPDATE
      ]
    );
    // Each schedule is locked until this save ends, so two saves of the same schedule (even of
    // a day that has no records yet) run one after the other and the second sees the first.
    Set<Date> days = new Set<Date>();
    for (Id scheduleId : savesBySchedule.keySet()) {
      days.addAll(
        ScheduleDayReads.checkedDays(
          schedules.get(scheduleId),
          savesBySchedule.get(scheduleId)
        )
      );
    }
    Map<Id, Map<Date, List<ScheduleDay__c>>> existing = ScheduleDayReads.existingParts(
      savesBySchedule.keySet(),
      days
    );
    List<ScheduleDay__c> toSave = new List<ScheduleDay__c>();
    List<ScheduleDay__c> toDelete = new List<ScheduleDay__c>();
    for (Id scheduleId : savesBySchedule.keySet()) {
      Batch batch = new Batch(
        scheduleId,
        existing.containsKey(scheduleId)
          ? existing.get(scheduleId)
          : new Map<Date, List<ScheduleDay__c>>()
      );
      for (DaySave save : savesBySchedule.get(scheduleId)) {
        batch.add(save);
      }
      toSave.addAll(batch.toSave);
      toDelete.addAll(batch.toDelete);
    }
    Savepoint beforeSave = Database.setSavepoint();
    try {
      Database.upsert(toSave, true, AccessLevel.USER_MODE);
      Database.delete(toDelete, true, AccessLevel.USER_MODE);
    } catch (Exception e) {
      Database.rollback(beforeSave);
      throw e;
    }
  }

  private static Integer nextRevision(
    List<ScheduleDay__c> before,
    Integer expectedRevision
  ) {
    Integer current = before.isEmpty() || before[0].Revision__c == null
      ? null
      : before[0].Revision__c.intValue();
    if (current != expectedRevision) {
      throw new ShoreshException(CHANGED_SINCE);
    }
    return current == null ? 1 : current + 1;
  }

  /** The parts a save writes and the parts it no longer needs. */
  private class Batch {
    private Id scheduleId;
    private Map<Date, List<ScheduleDay__c>> existing;
    private List<ScheduleDay__c> toSave = new List<ScheduleDay__c>();
    private List<ScheduleDay__c> toDelete = new List<ScheduleDay__c>();

    private Batch(Id scheduleId, Map<Date, List<ScheduleDay__c>> existing) {
      this.scheduleId = scheduleId;
      this.existing = existing;
    }

    private void add(DaySave save) {
      List<ScheduleDay__c> before = existing.containsKey(save.day)
        ? existing.get(save.day)
        : new List<ScheduleDay__c>();
      Integer revision = nextRevision(before, save.expectedRevision);
      List<String> texts = ScheduleGridParts.split(save.grid);
      for (Integer i = 0; i < texts.size(); i++) {
        ScheduleDay__c part = i < before.size()
          ? new ScheduleDay__c(Id = before[i].Id)
          : new ScheduleDay__c(Schedule__c = scheduleId, Date__c = save.day);
        part.Part__c = i + 1;
        part.Grid__c = texts[i];
        part.GridFormatVersion__c = ScheduleGrid.FORMAT_VERSION;
        part.Revision__c = revision;
        toSave.add(part);
      }
      for (Integer i = texts.size(); i < before.size(); i++) {
        toDelete.add(before[i]);
      }
    }
  }
}
