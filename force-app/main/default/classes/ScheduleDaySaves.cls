/**
 * Saves a schedule's days (ScheduleDay__c), each one grid in one or more parts. A save names the
 * revision each day was opened at; if a day was saved since, the whole save is refused, so two
 * schedulers never overwrite each other unseen. A save across several days and parts writes all
 * of them or none. Runs in user mode.
 */
public with sharing class ScheduleDaySaves {
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
    Schedule__c schedule = [
      SELECT
        Id,
        Week__r.Name,
        Week__r.StartDate__c,
        Week__r.EndDate__c,
        Program__r.Season__r.Camp__c
      FROM Schedule__c
      WHERE Id = :scheduleId
      WITH USER_MODE
      FOR UPDATE
    ];
    // The schedule is locked until this save ends, so two saves of the same schedule (even of a
    // day that has no records yet) run one after the other and the second sees the first.
    Set<Date> days = new Set<Date>();
    for (DaySave save : saves) {
      checkDate(schedule, save.day);
      if (!days.add(save.day)) {
        throw new ShoreshException('A save named the same day twice.');
      }
    }
    Batch batch = new Batch(scheduleId, existingParts(scheduleId, days));
    for (DaySave save : saves) {
      batch.add(save);
    }
    Savepoint beforeSave = Database.setSavepoint();
    try {
      Database.upsert(batch.toSave, true, AccessLevel.USER_MODE);
      Database.delete(batch.toDelete, true, AccessLevel.USER_MODE);
    } catch (Exception e) {
      Database.rollback(beforeSave);
      throw e;
    }
  }

  private static Map<Date, List<ScheduleDay__c>> existingParts(
    Id scheduleId,
    Set<Date> days
  ) {
    Map<Date, List<ScheduleDay__c>> result = new Map<Date, List<ScheduleDay__c>>();
    for (ScheduleDay__c part : [
      SELECT Id, Date__c, Part__c, Revision__c
      FROM ScheduleDay__c
      WHERE Schedule__c = :scheduleId AND Date__c IN :days
      WITH USER_MODE
      ORDER BY Date__c, Part__c
    ]) {
      if (!result.containsKey(part.Date__c)) {
        result.put(part.Date__c, new List<ScheduleDay__c>());
      }
      result.get(part.Date__c).add(part);
    }
    return result;
  }

  private static Integer nextRevision(
    List<ScheduleDay__c> before,
    Integer expectedRevision
  ) {
    Integer current = before.isEmpty() || before[0].Revision__c == null
      ? null
      : before[0].Revision__c.intValue();
    if (current != expectedRevision) {
      throw new ShoreshException(
        'Someone else changed this schedule since you opened it. Open it again to see their changes, then make yours.'
      );
    }
    return current == null ? 1 : current + 1;
  }

  private static void checkDate(Schedule__c schedule, Date day) {
    if (
      day == null ||
      day < schedule.Week__r.StartDate__c ||
      day > schedule.Week__r.EndDate__c
    ) {
      CampLabels labels = CampLabels.forCamp(
        schedule.Program__r.Season__r.Camp__c
      );
      throw new ShoreshException(
        'A day of this schedule is not in ' +
          schedule.Week__r.Name +
          ', the ' +
          labels.singularInSentence('Week') +
          ' it is for.'
      );
    }
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
