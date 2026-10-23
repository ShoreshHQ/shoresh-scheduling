/**
 * Server side of putting special days and events on the week (ADR 0014 slices 4 and 6): Put on a
 * day and Take off from a special day's details on the Special events screen, or from the day it
 * replaces on Manual Build and Generated Schedule (SpecialDayPlacing), and "Set it up"
 * on a cell an import noted as not set up yet, from Manual Build or Generated Schedule
 * (SpecialSetUp). In user mode.
 */
public with sharing class SpecialPlacingController {
  /**
   * Puts the special day on the week's weekday. Answers with a question, changing nothing, when
   * another special day is there and the request doesn't say to replace it.
   */
  @AuraEnabled
  public static SpecialDayPlacing.Placed putOnDay(
    SpecialDayPlacing.Request request
  ) {
    try {
      return SpecialDayPlacing.putOn(request);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /**
   * Takes the special day off the week's weekday: that day has its regular schedule again, and
   * the special day stays saved (ADR 0014 slice 6).
   */
  @AuraEnabled
  public static SpecialDayPlacing.Placed takeOffDay(
    SpecialDayPlacing.Request request
  ) {
    try {
      return SpecialDayPlacing.takeOff(request);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /**
   * "Set it up": the special event ('S') or special day ('D') a cell of the week's draft names,
   * made from what the file had.
   */
  @AuraEnabled
  public static SpecialSetUp.Done setUpItem(
    Id scheduleId,
    String kind,
    String name
  ) {
    try {
      return SpecialSetUp.setUp(scheduleId, kind, name);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }
}
