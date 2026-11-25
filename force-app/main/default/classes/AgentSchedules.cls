/**
 * Which of a week's schedules a person's action through an agent or the command line is on
 * (docs/protocol/api.md API-1.41): Generated Schedule or Manual Build, named by "schedule" or the
 * one the week has, never picked when it has both; and each screen's own server actions the
 * actions share on it (API-1.42, API-1.43). Runs in user mode, as AgentWeeks.
 */
public with sharing class AgentSchedules {
  /** Asked for when an edit of a Generated Schedule week comes without the week as it was read. */
  public static final String SAY_SEEN = 'Say what the week was when you read it (seen), as read_week_checks gives it, so a change someone made since isn\'t undone.';

  /** The field naming which screen's schedule of the week. */
  public static final String SCHEDULE = 'schedule';
  private static final String BOTH =
    GeneratedDrafts.NAME +
    ' or ' +
    ManualDrafts.NAME;

  /**
   * The season's week on the screen that holds it, locked as that screen's save locks it.
   * Refused before the week is built or started there.
   */
  public static AgentWeeks.Week eitherOf(Map<String, Object> body) {
    return eitherOf(body, null);
  }

  /** eitherOf, on the week found already (placeOfEither, by a preview), not found again. */
  public static AgentWeeks.Week eitherOf(
    Map<String, Object> body,
    AgentWeeks.Week found
  ) {
    AgentWeeks.Week result = found == null ? placeOfEither(body) : found;
    requireDraft(result);
    result.draft = result.manual
      ? ManualDrafts.locked(result.draft.Id)
      : GeneratedDrafts.lockedToEdit(result.draft.Id);
    return result;
  }

  /**
   * The season's week and the draft of the screen asked for, as found, unlocked. Left out, it is
   * the one the week has; a week with both is refused, naming them.
   */
  public static AgentWeeks.Week placeOfEither(Map<String, Object> body) {
    AgentWeeks.Week result = AgentWeeks.placeOf(body);
    Schedule__c manual = ManualDrafts.find(result.program.Id, result.weekId);
    String asked = AgentFields.text(body, SCHEDULE);
    result.manual = String.isBlank(asked)
      ? onlyOne(result, manual)
      : isManual(asked);
    if (result.manual) {
      result.draft = manual;
    }
    return result;
  }

  /** Whether the screen asked for is Manual Build; a name that is neither is refused. */
  private static Boolean isManual(String asked) {
    String folded = IncomingBatch.fold(asked);
    if (folded == IncomingBatch.fold(ManualDrafts.NAME)) {
      return true;
    }
    if (folded == IncomingBatch.fold(GeneratedDrafts.NAME)) {
      return false;
    }
    throw new ShoreshException(
      'There is no schedule called "' +
        asked.left(80) +
        '". Say ' +
        BOTH +
        ' (schedule).'
    );
  }

  /** Whether the week's one schedule is Manual Build; a week with both is refused. */
  private static Boolean onlyOne(AgentWeeks.Week week, Schedule__c manual) {
    if (manual == null) {
      return false;
    }
    if (week.draft != null) {
      throw new ShoreshException(
        week.name +
          ' has a ' +
          GeneratedDrafts.NAME +
          ' and a ' +
          ManualDrafts.NAME +
          ' for ' +
          week.program.Name +
          '. Say which (schedule): ' +
          BOTH +
          '.'
      );
    }
    return true;
  }

  /** Refused, in plain words, when the week has no draft on its screen yet. */
  public static void requireDraft(AgentWeeks.Week week) {
    if (week.draft != null) {
      return;
    }
    throw new ShoreshException(
      week.manual
        ? week.name +
          ' hasn\'t been started on ' +
          ManualDrafts.NAME +
          ' for ' +
          week.program.Name +
          ' yet.'
        : week.name + ' hasn\'t been built for ' + week.program.Name + ' yet.'
    );
  }

  /** The screen a week's draft is on: "Generated Schedule" or "Manual Build". */
  public static String screenOf(AgentWeeks.Week week) {
    return week.manual ? ManualDrafts.NAME : GeneratedDrafts.NAME;
  }

  /** Manual Build has no Lock menu: nothing is built over its cells. */
  public static void refuseLocks(AgentWeeks.Week week) {
    if (week.manual) {
      throw new ShoreshException(
        ManualDrafts.NAME +
          ' has no locks: only ' +
          GeneratedDrafts.NAME +
          '\'s cells are locked, to keep them when the week is built again.'
      );
    }
  }

  /**
   * Holds a Generated Schedule week until the request ends and refuses an edit (409, nothing
   * changed) unless the week is still as it was read: its ticket (seen, in field), never the week
   * read here in its place (WeekTickets.seenBlankNever). Manual Build's save has no ticket: each
   * of its runs is made only while its cells hold what was seen. Answers the ticket, for the save.
   */
  public static String holdAsSeen(
    AgentWeeks.Week week,
    Map<String, Object> body,
    String field
  ) {
    String seen = AgentFields.text(body, field);
    if (week.manual) {
      return seen;
    }
    if (String.isBlank(seen)) {
      throw new ShoreshException(SAY_SEEN);
    }
    GeneratedDrafts.lockedToEdit(week.draft.Id);
    if (
      !WeekTickets.seenBlankNever(
        WeekTickets.stamp(ScheduleDays.read(week.draft.Id)),
        seen
      )
    ) {
      throw new AgentWeeks.ConflictException(ScheduleDaySaves.CHANGED_SINCE);
    }
    return seen;
  }

  /** Whether a cell (group and block positions) is locked; Manual Build has no locks. */
  public static Boolean isLocked(
    AgentWeeks.Week week,
    ScheduleGrid grid,
    List<Integer> cell
  ) {
    return !week.manual && ScheduleGridLocks.isLocked(grid, cell[0], cell[1]);
  }

  /** The screen's own publish preview: what is published now and the week's revisions. */
  public static SchedulePublish.Preview preview(AgentWeeks.Week week) {
    return week.manual
      ? ManualBuildController.previewPublish(week.draft.Id)
      : GeneratedScheduleController.previewPublish(week.draft.Id);
  }

  /** The screen's own Publish, with what its preview saw. */
  public static SchedulePublish.Result publish(
    AgentWeeks.Week week,
    SchedulePublish.Preview seen
  ) {
    Id seenPublishedId = seen.published == null ? null : seen.published.id;
    return week.manual
      ? ManualBuildController.publish(
          week.draft.Id,
          seen.revisions,
          seenPublishedId
        )
      : GeneratedScheduleController.publish(
          week.draft.Id,
          seen.revisions,
          seenPublishedId
        );
  }

  /**
   * The screen's own save of one hand edit, made whole or not at all: Manual Build's saveSlots, or
   * Generated Schedule's hand-edit save with the week's ticket (seen, from holdAsSeen).
   */
  public static SlotEdits.Result saveEdit(
    AgentWeeks.Week week,
    String seen,
    SlotEdits.Edit edit
  ) {
    return week.manual
      ? ManualBuildController.saveSlots(
          week.draft.Id,
          new List<SlotEdits.Edit>{ edit }
        )
      : AgentCells.handEdit(week, seen, edit);
  }

  /** The screen's own Unpublish of the published schedule it showed. */
  public static SchedulePublish.Result unpublish(
    AgentWeeks.Week week,
    Id seenPublishedId
  ) {
    return week.manual
      ? ManualBuildController.unpublish(week.draft.Id, seenPublishedId)
      : GeneratedScheduleController.unpublish(week.draft.Id, seenPublishedId);
  }

  /** The week's camp's own words, with or without a draft. */
  public static CampLabels campWordsOf(AgentWeeks.Week week) {
    Id campId = [
      SELECT Camp__c
      FROM Season__c
      WHERE Id = :week.season.Id
      WITH USER_MODE
    ]
    .Camp__c;
    return CampLabels.forCamp(campId);
  }
}
