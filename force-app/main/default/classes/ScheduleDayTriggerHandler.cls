/**
 * Schedule days: before a save or delete, published history stays as it is (PublishedGuard);
 * after one, a special event's days follow the drafts that hold it (SpecialEventDays, ADR 0014
 * slice 4).
 */
public with sharing class ScheduleDayTriggerHandler {
  public static void handle(
    System.TriggerOperation operation,
    List<ScheduleDay__c> news,
    List<ScheduleDay__c> olds
  ) {
    switch on operation {
      when BEFORE_INSERT, BEFORE_UPDATE {
        PublishedGuard.checkDays(news);
      }
      when BEFORE_DELETE {
        PublishedGuard.checkDays(olds);
      }
      when else {
        SpecialEventDays.afterDays(news, olds);
      }
    }
  }
}
