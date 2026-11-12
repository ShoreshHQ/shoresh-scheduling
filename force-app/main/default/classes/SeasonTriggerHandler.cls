/**
 * Changing and deleting a season. An archived season takes no change but being brought back, and
 * is not deleted (WEEK-1.10); which seasons are archived is read again after a season is archived,
 * brought back, or made, deleted or restored archived (ArchivedSeasons). Deleting refuses a season
 * with published history. Otherwise clears the rows inside the season that point at the season's own records through restrict-delete lookups (week
 * exceptions, elective runs, who recurring activities and linked choices cover, linked choices
 * and elective sets, fixed and recurring activities, activities and who can do them, schedules,
 * special dates and plans, special events), which
 * would otherwise block the whole delete (platform check (a)). Salesforce checks those lookups
 * after before-delete triggers run, so clearing them here lets the season go.
 */
public with sharing class SeasonTriggerHandler {
  public static void handle(
    System.TriggerOperation operation,
    List<Season__c> seasons,
    Map<Id, Season__c> before
  ) {
    if (operation == System.TriggerOperation.BEFORE_UPDATE) {
      refuseArchivedChanges(seasons, before);
    } else if (operation == System.TriggerOperation.BEFORE_DELETE) {
      beforeDelete(before);
    } else {
      // Made, changed, deleted or restored: read again if archived (ArchivedSeasons).
      ArchivedSeasons.seasonsSaved(seasons ?? before.values(), before);
    }
  }

  /**
   * WEEK-1.10: an archived season takes no change but being brought back (Archived__c unticked),
   * which may come with nothing else.
   */
  private static void refuseArchivedChanges(
    List<Season__c> seasons,
    Map<Id, Season__c> before
  ) {
    for (Season__c season : seasons) {
      if (before.get(season.Id).Archived__c && season.Archived__c) {
        season.addError(ArchivedSeasons.refusal(before.get(season.Id).Name));
      }
    }
  }

  public static void beforeDelete(Map<Id, Season__c> oldSeasons) {
    // WEEK-1.10: an archived season is read-only, so it is not deleted either.
    List<Season__c> live = new List<Season__c>();
    for (Season__c season : oldSeasons.values()) {
      if (season.Archived__c) {
        season.addError(ArchivedSeasons.refusal(season.Name));
      } else {
        live.add(season);
      }
    }
    Map<Id, Id> campIdBySeasonId = new Map<Id, Id>();
    for (Season__c season : live) {
      campIdBySeasonId.put(season.Id, season.Camp__c);
    }
    if (!live.isEmpty()) {
      PublishedHistory.refuseDeletes(live, 'Season', campIdBySeasonId);
    }

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
    SetupWrite.run(SetupWrite.Kind.OWN_ROWS, new SeasonRows(deletable));
  }

  /** The season's own rows that would block its delete, cleared. */
  private inherited sharing class SeasonRows implements SetupWrite.Steps {
    private Set<Id> deletable;

    private SeasonRows(Set<Id> deletable) {
      this.deletable = deletable;
    }

    public void write() {
      // Elective runs point at the season's elective sets, weeks and schedules, and their
      // choices and seats at its campers, groups, time blocks and offerings; they go first.
      clear(
        [
          SELECT Id
          FROM ElectiveRun__c
          WHERE Season__c IN :deletable
          WITH SYSTEM_MODE
        ]
      );
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
      // Linked choices point at offerings, and their times at time blocks; offerings point at
      // activities. Clearing the sets (with their linked choices) frees both.
      clear(
        [
          SELECT Id
          FROM LinkedChoice__c
          WHERE ElectiveSet__r.Season__c IN :deletable
          WITH SYSTEM_MODE
        ]
      );
      clear(
        [
          SELECT Id
          FROM ElectiveSet__c
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
      // Schedules point at the season's weeks (restrict-delete); their days go with them. The
      // season's imported weeks go too: they are kept only while their season is (ImportedWeekGuard).
      ImportedWeekGuard.allow();
      try {
        clear(
          [
            SELECT Id
            FROM Schedule__c
            WHERE Program__r.Season__c IN :deletable
            WITH SYSTEM_MODE
          ]
        );
      } finally {
        ImportedWeekGuard.done();
      }
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
    }
  }

  private static void clear(List<SObject> rows) {
    if (!rows.isEmpty()) {
      Database.delete(rows, true, AccessLevel.SYSTEM_MODE);
    }
  }
}
