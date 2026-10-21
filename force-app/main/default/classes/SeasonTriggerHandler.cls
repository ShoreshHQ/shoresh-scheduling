/**
 * Deleting a season. Refuses a season with published history. Otherwise clears the rows inside
 * the season that point at the season's own records through restrict-delete lookups (week
 * exceptions, who recurring activities cover, fixed and recurring activities, activities and
 * who can do them, schedules, special dates and plans, special events), which
 * would otherwise block the whole delete (platform check (a)). Salesforce checks those lookups
 * after before-delete triggers run, so clearing them here lets the season go.
 */
public with sharing class SeasonTriggerHandler {
  public static void beforeDelete(Map<Id, Season__c> oldSeasons) {
    Map<Id, Id> campIdBySeasonId = new Map<Id, Id>();
    for (Season__c season : oldSeasons.values()) {
      campIdBySeasonId.put(season.Id, season.Camp__c);
    }
    PublishedHistory.refuseDeletes(
      oldSeasons.values(),
      'Season',
      campIdBySeasonId
    );

    Set<Id> deletable = new Set<Id>();
    for (Season__c season : oldSeasons.values()) {
      if (!season.hasErrors()) {
        deletable.add(season.Id);
      }
    }
    if (deletable.isEmpty()) {
      return;
    }
    // System mode on purpose: these rows go with the season anyway (master-detail), and a
    // scheduler allowed to delete the season must not be stopped by a row they cannot see.
    // Nothing left behind can clash, so the fixed and recurring activity check is held off.
    SetTimeGuard.defer();
    try {
      clear(
        [
          SELECT Id
          FROM WeekException__c
          WHERE Week__r.Season__c IN :deletable
          WITH SYSTEM_MODE
        ]
      );
      // Who recurring activities cover points at the season's groups and divisions; fixed and
      // recurring activities point at its time blocks and locations; activities at its
      // locations, groups, and divisions (who can do them goes with them). All through
      // restrict-delete lookups.
      clear(
        [
          SELECT Id
          FROM Coverage__c
          WHERE Season__c IN :deletable
          WITH SYSTEM_MODE
        ]
      );
      clear(
        [
          SELECT Id
          FROM FixedActivity__c
          WHERE Program__r.Season__c IN :deletable
          WITH SYSTEM_MODE
        ]
      );
      clear(
        [
          SELECT Id
          FROM RecurringActivity__c
          WHERE Program__r.Season__c IN :deletable
          WITH SYSTEM_MODE
        ]
      );
      // Schedules point at the season's weeks (restrict-delete); their days go with them.
      clear(
        [
          SELECT Id
          FROM Schedule__c
          WHERE Program__r.Season__c IN :deletable
          WITH SYSTEM_MODE
        ]
      );
      // Special dates point at the season's weeks and special days and events; plans at the
      // special days and events; special events at its locations. Clearing the dates first
      // means no special event is refused for still being on a day.
      clear(
        [
          SELECT Id
          FROM SpecialDate__c
          WHERE Season__c IN :deletable
          WITH SYSTEM_MODE
        ]
      );
      clear(
        [
          SELECT Id
          FROM PlanPart__c
          WHERE Season__c IN :deletable
          WITH SYSTEM_MODE
        ]
      );
      clear(
        [
          SELECT Id
          FROM SpecialEvent__c
          WHERE Season__c IN :deletable
          WITH SYSTEM_MODE
        ]
      );
      clear(
        [
          SELECT Id
          FROM Activity__c
          WHERE Season__c IN :deletable
          WITH SYSTEM_MODE
        ]
      );
    } finally {
      SetTimeGuard.resume();
    }
  }

  private static void clear(List<SObject> rows) {
    if (!rows.isEmpty()) {
      Database.delete(rows, true, AccessLevel.SYSTEM_MODE);
    }
  }
}
