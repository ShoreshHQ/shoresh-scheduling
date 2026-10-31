/**
 * undo: take back the person's last change made through an agent or the command line in a
 * program's Generated Schedule or Manual Build week (docs/protocol/api.md API-1.14, API-1.41). Web
 * address /v1/undo_last_agent_change, POST {season, week, program, schedule}. It is Versions' own Restore (ManualVersions.restoreInto) of the
 * version that change kept first, so the week as it was before Undo is kept too ("Before
 * Restore"), and it is refused when anyone has saved the week since that change: a newer change is
 * never taken back unseen.
 */
@RestResource(urlMapping='/v1/undo_last_agent_change')
global with sharing class AgentUndo implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'schedule'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentUndo());
  }

  public String run() {
    AgentWeeks.Week week = AgentSchedules.eitherOf(AgentFields.body(FIELDS));
    Id draftId = week.draft.Id;
    Id me = UserInfo.getUserId();
    List<Schedule__c> kept = [
      SELECT Id, Name, RevisionsAfter__c
      FROM Schedule__c
      WHERE
        SourceSchedule__c = :draftId
        AND VersionReason__c = :AgentWeeks.THROUGH_AGENT
        AND RevisionsAfter__c != NULL
        AND CreatedById = :me
      WITH USER_MODE
      ORDER BY CreatedDate DESC, Id DESC
      LIMIT 1
    ];
    if (kept.isEmpty()) {
      throw new ShoreshException(
        'There is no change made through an agent to undo in ' + week.name + '.'
      );
    }
    Schedule__c version = kept[0];
    String what = version.Name.removeStart('Before ');
    // Undone only while the week is exactly as that change left it.
    List<ScheduleDays.DayGrid> now = ScheduleDays.read(draftId);
    try {
      if (AgentWeeks.fingerprint(now) != version.RevisionsAfter__c) {
        throw new ManualVersions.ChangedSinceException();
      }
      ManualVersions.restoreInto(
        week.draft,
        version.Id,
        ScheduleDays.stamp(now)
      );
    } catch (ManualVersions.ChangedSinceException e) {
      throw new ShoreshException(
        'Someone saved ' +
          week.name +
          ' since "' +
          what +
          '", so it was not undone. Versions has "' +
          version.Name +
          '" to restore by hand.'
      );
    }
    // Undone: neither it nor an older change through an agent is undone this way again.
    List<Schedule__c> spent = new List<Schedule__c>();
    for (Schedule__c each : [
      SELECT Id
      FROM Schedule__c
      WHERE
        SourceSchedule__c = :draftId
        AND VersionReason__c = :AgentWeeks.THROUGH_AGENT
        AND RevisionsAfter__c != NULL
        AND CreatedById = :me
      WITH USER_MODE
    ]) {
      spent.add(new Schedule__c(Id = each.Id, RevisionsAfter__c = null));
    }
    Database.update(spent, AccessLevel.USER_MODE);
    return 'Undid "' + what + '".';
  }
}
