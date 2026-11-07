/**
 * apply_to_other_weeks: Apply to other weeks through an agent or the command line
 * (docs/protocol/api.md API-1.125, WEEK-6.2). Web address /v1/apply_to_other_weeks, POST {season,
 * week, program, schedule, to_week}: one week per call, as on the screen (WeekApply). It asks
 * first (API-1.106): the preview says what changes, what locks keep and what can't go; the confirm
 * holds only while both weeks are as that preview read them.
 */
@RestResource(urlMapping='/v1/apply_to_other_weeks')
global with sharing class AgentApplyToOtherWeeks implements AgentWeeks.Action, AgentAskFirst.Preview {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'schedule',
    'to_week'
  };

  private AgentWeeks.Week source;
  private WeekApply.Outcome previewed;

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentApplyToOtherWeeks());
  }

  /** What it would do; null, so nothing is asked, when no cell would change (API-1.106). */
  public String preview() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    // Found, not locked: WeekApply takes the program's lock, then the target's, as the screen
    // does, so an AI and a screen applying opposite ways never wait on each other.
    source = AgentSchedules.placeOfEither(body);
    AgentSchedules.requireDraft(source);
    Week__c target = AgentWeeks.weekIn(
      source.season,
      AgentFields.text(body, 'to_week')
    );
    previewed = WeekApply.preview(source.draft.Id, target.Id, null);
    if (previewed.problem != null) {
      throw new ShoreshException(previewed.problem);
    }
    AgentAskFirst.stateIs(previewed.seen);
    if (previewed.cellsChanging == 0) {
      return null;
    }
    return 'This applies ' +
      source.name +
      ' (' +
      source.program.Name +
      ', ' +
      screen() +
      ') to ' +
      previewed.weekName +
      ': ' +
      cellWords(previewed.cellsChanging) +
      '.' +
      lists(previewed) +
      ' ' +
      whatIsKept() +
      publishedWords();
  }

  public String run() {
    WeekApply.Outcome done = WeekApply.apply(
      source.draft.Id,
      previewed.weekId,
      previewed.seen
    );
    if (done.changedSince) {
      throw new AgentWeeks.ConflictException(
        'Someone changed ' +
          source.name +
          ' or ' +
          done.weekName +
          ' since, so nothing was applied.'
      );
    }
    if (done.problem != null) {
      throw new ShoreshException(done.problem);
    }
    if (!done.applied) {
      return done.weekName +
        ' already matches ' +
        source.name +
        '.' +
        lists(done);
    }
    return 'Applied ' +
      source.name +
      ' to ' +
      done.weekName +
      ': ' +
      cellWords(done.cellsChanging) +
      '.' +
      lists(done) +
      publishedWords();
  }

  private String screen() {
    return source.manual ? ManualDrafts.NAME : GeneratedDrafts.NAME;
  }

  private static String cellWords(Integer count) {
    return count == 1 ? '1 cell changes' : count + ' cells change';
  }

  private static String lists(WeekApply.Outcome outcome) {
    return listed('Locked, kept', outcome.keptLocked) +
      listed('Can\'t go', outcome.leftOut) +
      listed('Not placed', outcome.notPlaced);
  }

  private static String listed(String heading, List<String> lines) {
    return lines.isEmpty()
      ? ''
      : ' ' + heading + ': ' + String.join(lines, '; ') + '.';
  }

  private String whatIsKept() {
    return previewed.startsDraft
      ? previewed.weekName + ' gets its first ' + screen() + '.'
      : previewed.weekName +
        '\'s ' +
        screen() +
        ' goes to its Versions first as "' +
        WeekApply.versionName(source.name) +
        '".';
  }

  private String publishedWords() {
    return previewed.published
      ? ' Its published schedule stays as it is until it is published again.'
      : '';
  }
}
