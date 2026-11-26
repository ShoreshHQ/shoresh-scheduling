/**
 * Rainy day (repo docs/adr/0019; desktop ScheduleScreen.jsx "Rainy day…"): before a day is
 * switched to rain plans, the week is kept as an automatic version under the name the screen
 * gives ("Before rainy Monday"), so the dry day is there after Undo has gone. The switch itself
 * saves through the screen's own slot saves (SlotSaves), as one edit. Runs in user mode.
 */
public with sharing class RainyDayController {
  /** Manual Build's week as it is now, kept as "Before rainy <day>". */
  @AuraEnabled
  public static Id keepManualWeek(Id scheduleId, String name) {
    try {
      return keep(ManualDrafts.locked(scheduleId), name);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** The Generated week as it is now, locks and option too, kept as "Before rainy <day>". */
  @AuraEnabled
  public static Id keepGeneratedWeek(Id scheduleId, String name) {
    try {
      return keep(GeneratedDrafts.lockedToEdit(scheduleId), name);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  private static Id keep(Schedule__c draft, String name) {
    return ManualVersions.keepAutomatically(
      draft,
      // An automatic name is never refused for its length: "Before Clear <a long bunk> · Monday"
      // is shortened to fit, so the change itself goes ahead (WEEK-6.14).
      SchedulesController.checkedName(
        name == null ? null : name.abbreviate(SchedulesController.NAME_LIMIT),
        draft.Program__r.Season__r.Camp__c
      ),
      ScheduleDays.read(draft.Id)
    );
  }
}
