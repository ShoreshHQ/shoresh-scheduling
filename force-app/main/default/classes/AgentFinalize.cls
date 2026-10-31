/**
 * finalize: finalize a week's elective seats, as the person, through an agent or the command line
 * (docs/protocol/api.md API-1.23). Web address /v1/finalize_electives, POST {season, week,
 * elective_set}. It is the Elective seats screen's own Finalize (ElectiveSeatsController
 * finalizeRun) of the run the screen opens on for that set and week (its Committed run), at the
 * revision it reads just before. Refusals ("Assign seats first.", "Schedule changed. Assign again
 * first.", a double-booked place) are the screen's own, after "Not finalized."
 */
@RestResource(urlMapping='/v1/finalize_electives')
global with sharing class AgentFinalize implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'elective_set'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentFinalize());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentWeeks.requireScheduler();
    Season__c season = OutgoingRows.seasonCalled(
      AgentFields.text(body, 'season')
    );
    Week__c week = AgentWeeks.weekIn(season, AgentFields.text(body, 'week'));
    ElectiveSet__c electiveSet = setOf(
      season,
      AgentFields.text(body, 'elective_set')
    );
    Id runId = null;
    Boolean finalOnly = false;
    for (
      ElectiveSeats.RunInfo each : ElectiveSeatsController.seatsSetup(season.Id)
        .runs
    ) {
      if (each.setId != electiveSet.Id || each.weekId != week.Id) {
        continue;
      }
      if (each.status == ElectiveRunState.COMMITTED && runId == null) {
        runId = each.id;
      } else if (each.status != ElectiveRunState.COMMITTED) {
        finalOnly = true;
      }
    }
    if (runId == null) {
      throw new ShoreshException(
        finalOnly
          ? electiveSet.Name + ' in ' + week.Name + ' is already finalized.'
          : 'Not finalized. Assign seats first.'
      );
    }
    try {
      ElectiveSeatsController.finalizeRun(
        runId,
        ElectiveSeatsController.openRun(runId).revision
      );
    } catch (AuraHandledException e) {
      throw new ShoreshException('Not finalized. ' + e.getMessage());
    }
    return 'Finalized ' + electiveSet.Name + ' in ' + week.Name + '.';
  }

  /** The season's elective set of that name; may be left out when the season has only one. */
  private static ElectiveSet__c setOf(Season__c season, String name) {
    List<ElectiveSet__c> sets = [
      SELECT Id, Name
      FROM ElectiveSet__c
      WHERE Season__c = :season.Id
      WITH USER_MODE
      ORDER BY Name
    ];
    if (String.isBlank(name) && sets.size() == 1) {
      return sets[0];
    }
    if (String.isBlank(name)) {
      List<String> names = new List<String>();
      for (ElectiveSet__c each : sets) {
        names.add(each.Name);
      }
      throw new ShoreshException(
        sets.isEmpty()
          ? season.Name + ' has no electives yet.'
          : 'Say which electives (elective_set): ' +
            String.join(names, ', ') +
            '.'
      );
    }
    return (ElectiveSet__c) AgentWeeks.named(sets, name, 'elective set');
  }
}
