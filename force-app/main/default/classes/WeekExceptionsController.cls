/** Server side of the week exceptions grid on Camp Setup. */
public with sharing class WeekExceptionsController {
  /** Marks groups as not running in weeks (adds) and clears marks (removes), all or none. */
  @AuraEnabled
  public static void saveWeekExceptions(
    List<WeekException__c> toAdd,
    List<Id> toRemove
  ) {
    try {
      WeekExceptions.save(toAdd, toRemove);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }
}
