/**
 * Server side of putting a special day on a day from its details on the Special events screen
 * (ADR 0014 slice 4): SpecialDayPlacing, in user mode.
 */
public with sharing class SpecialPlacingController {
  /**
   * Puts the special day on the week's weekday ("Friday"). Answers with a question, changing
   * nothing, when another special day is there and replace isn't true.
   */
  @AuraEnabled
  public static SpecialDayPlacing.Placed putOnDay(
    Id specialDayId,
    Id weekId,
    String day,
    Boolean replace
  ) {
    try {
      return SpecialDayPlacing.putOn(specialDayId, weekId, day, replace);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }
}
