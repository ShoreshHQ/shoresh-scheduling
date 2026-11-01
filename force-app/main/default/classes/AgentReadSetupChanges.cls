/**
 * read_setup_changes: what Generated Schedule and Manual Build show when setup changed since the
 * week started, through an agent or the command line (docs/protocol/api.md API-1.63). Web address
 * /v1/read_setup_changes, GET ?season=&week=&program=&schedule=. It is the screens' own list
 * (SetupMatchController.getSetupChanges): each change "Update to match setup" can make, by its
 * key, with the cells it changes and why, and the week as read (seen), which
 * update_to_match_setup sends back.
 */
@RestResource(urlMapping='/v1/read_setup_changes')
global with sharing class AgentReadSetupChanges implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'schedule'
  };

  @HttpGet
  global static void get() {
    AgentWeeks.answer(new AgentReadSetupChanges());
  }

  public String run() {
    Map<String, Object> asked = new Map<String, Object>();
    for (String key : RestContext.request.params.keySet()) {
      if (!FIELDS.contains(key)) {
        throw new ShoreshException(
          'Shoresh doesn\'t know the field "' +
            key.left(40) +
            '". The fields are: season, week, program, schedule.'
        );
      }
      asked.put(key, RestContext.request.params.get(key));
    }
    AgentWeeks.Week week = AgentSchedules.placeOfEither(asked);
    AgentSchedules.requireDraft(week);
    // The screens' own list.
    SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
      week.draft.Id
    );
    String onScreen = week.name + ' on ' + AgentSchedules.screenOf(week);
    if (preview.problem != null) {
      return onScreen +
        ' can\'t be compared with setup now: ' +
        preview.problem;
    }
    if (preview.changes.isEmpty()) {
      return onScreen + ' matches setup: there is nothing to update.';
    }
    List<String> said = new List<String>();
    for (SetupMatch.Change change : preview.changes) {
      said.add(AgentUpdateToMatch.said(change));
    }
    return 'Setup changed since ' +
      onScreen +
      ' started. "Update to match setup" can make these changes, each by its key: ' +
      String.join(said, ' ') +
      ' To make some or all, send their keys with update_to_match_setup and seen "' +
      AgentUpdateToMatch.seenOf(preview.revisions) +
      '".';
  }
}
