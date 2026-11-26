/**
 * read: a program's Generated Schedule or Manual Build week's checks, as the person, through an
 * agent or the command line (docs/protocol/api.md API-1.30, API-1.44). Web address
 * /v1/week_checks, GET ?season=&week=&program=&schedule=. On Manual Build it answers what that
 * screen reads (its draft, ManualBuildViews) in place of what Generate reads. The checks are worked out where the screen works them out, outside
 * Salesforce (the connector runs the same modules the screen's counter does), so this answers what
 * the screen reads to show them: what Generate reads (GeneratedInputs), what setup changed since
 * the week was built (SetupMatch, getSetupChanges's own) and the lines accepted with the week
 * (WeekAccepts.accepted, the counter's own). The program's setup for the week is read once for
 * all of them.
 */
@RestResource(urlMapping='/v1/week_checks')
global with sharing class AgentChecks implements AgentRequest.Read {
  // What a week never built has none of: its checks, or its draft (AgentReadDraft).
  private String what;

  @HttpGet
  global static void get() {
    AgentRequest.answer(new AgentChecks('checks'));
  }

  /**
   * Answers what the week's screen reads, or why it can't: here and for /v1/read_week_draft
   * (AgentReadDraft), so the counter and the draft read read the same week. A week never built
   * has no <what>.
   */
  public AgentChecks(String what) {
    this.what = what;
  }

  public Set<String> fields() {
    return new Set<String>{ 'season', 'week', 'program', 'schedule' };
  }

  public String run(Map<String, Object> asked) {
    AgentWeeks.Week week = AgentSchedules.placeOfEither(asked);
    requireDraft(week, what);
    Map<String, Object> read = AgentBuild.setupOf(week);
    // The program's setup for the week, read once for the draft and its setup changes, on the
    // season's activities and locations the season's setup has just read (G8).
    GeneratedSetup setup = loaded(week, read);
    List<ScheduleDays.DayGrid> draftDays = new List<ScheduleDays.DayGrid>();
    if (week.manual) {
      read.put('draft', ManualBuildViews.openWith(week.draft.Id, setup));
    } else {
      read.put('inputs', inputsOf(setup, draftDays));
    }
    read.put('setup_changes', setupChangesOf(week, setup, draftDays));
    read.put('accepted', WeekAccepts.accepted(week.draft.Id));
    // The week as it is called, for the labels an edit's version and Undo line carry.
    read.put('week_name', week.name);
    return JSON.serialize(read, true);
  }

  /**
   * What the week's screens read, on one read of its setup: on Manual Build its draft (getDraft's,
   * ManualBuildViews), on Generated Schedule what Generate reads (getInputs's, GeneratedInputs),
   * and the setup changed since (getSetupChanges's, SetupMatch). Refused in the screens' words
   * when it can't be read, as their own reads are (ScreenErrors.ofLoading).
   */
  private static GeneratedSetup loaded(
    AgentWeeks.Week week,
    Map<String, Object> read
  ) {
    try {
      return new GeneratedSetup(week.program.Id, week.weekId)
        .withSeason((SeasonSetupReader.SeasonSetup) read.get('setup'));
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  private static GeneratedInputs.Inputs inputsOf(
    GeneratedSetup setup,
    List<ScheduleDays.DayGrid> draftDays
  ) {
    try {
      return GeneratedInputs.read(setup, draftDays);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** draftDays: Generated Schedule's as getInputs read them; Manual Build's are read here. */
  private static SetupMatch.Preview setupChangesOf(
    AgentWeeks.Week week,
    GeneratedSetup setup,
    List<ScheduleDays.DayGrid> draftDays
  ) {
    try {
      return SetupMatch.onSetup(
        setup,
        week.manual ? ScheduleDays.read(week.draft.Id) : draftDays
      );
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** Refused before the week is built (Generated Schedule) or started (Manual Build). */
  public static void requireDraft(AgentWeeks.Week week) {
    requireDraft(week, 'checks');
  }

  private static void requireDraft(AgentWeeks.Week week, String what) {
    if (week.draft == null && !week.manual) {
      throw new ShoreshException(notBuilt(week, what));
    }
    AgentSchedules.requireDraft(week);
  }

  /** A week never built has no checks or draft: Generated Schedule shows none until it is. */
  public static String notBuilt(AgentWeeks.Week week, String what) {
    return week.name +
      ' hasn\'t been built for ' +
      week.program.Name +
      ' yet, so it has no ' +
      what +
      '.';
  }
}
