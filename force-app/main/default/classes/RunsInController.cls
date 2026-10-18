/**
 * For the setup tables' "Runs in" ticks: before weeks are unticked, how many slots each already
 * has in that week's Manual Build and Generated Schedule, so the screen can ask first (Shoresh
 * desktop ExclusionConfirmDialog.jsx).
 */
public with sharing class RunsInController {
  @AuraEnabled
  public static List<PlacedInWeeks.Placed> placedInWeeks(
    List<RunsIn.WeekOff> weeksOff
  ) {
    try {
      return PlacedInWeeks.count(weeksOff);
    } catch (Exception e) {
      // A count that can't be made is tried again; the ticks are still on screen.
      throw ScreenErrors.of(e);
    }
  }
}
