/**
 * update_to_match_setup: "Update to match setup" on Generated Schedule or Manual Build, through an
 * agent or the command line (docs/protocol/api.md API-1.64). Web address /v1/update_to_match_setup,
 * POST {season, week, program, schedule, changes, seen}. It is the screens' own update
 * (SetupMatchController.updateToMatchSetup) of the changes named by key, done only while the week
 * is still as read_setup_changes read it (seen), with the week locked as its screen's save locks
 * it; otherwise refused (409), nothing changed. As on the screen, the update keeps a version
 * ("Before Update to match setup", Auto-saved) only when a change replaces a placement made by
 * hand, and the screen has no Undo for it: that version is the way back (API-1.14). A change that
 * replaces a placement made by hand, locked or not, is the person's own work: Shoresh asks first
 * (API-1.106), naming each cell it replaces.
 */
@RestResource(urlMapping='/v1/update_to_match_setup')
global with sharing class AgentUpdateToMatch implements AgentRequest.Change, AgentAskFirst.Preview {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'schedule',
    'changes',
    'seen'
  };

  @HttpPost
  global static void post() {
    AgentRequest.answer(new AgentUpdateToMatch());
  }

  public Set<String> fields() {
    return FIELDS;
  }

  /**
   * Asked only when a change named replaces a placement made by hand, on the week as read (seen):
   * each such cell, before and after. A week changed since, or a change no longer offered, asks
   * nothing here: the update refuses it.
   */
  public String preview(Map<String, Object> body) {
    Set<String> keys = new Set<String>(keysOf(body.get('changes')));
    String seen = AgentFields.text(body, 'seen');
    AgentWeeks.Week week = AgentSchedules.placeOfEither(body);
    if (String.isBlank(seen) || week.draft == null) {
      return null;
    }
    SetupMatch.Preview shown = SetupMatchController.getSetupChanges(
      week.draft.Id
    );
    if (!WeekTickets.seenBlankNever(seenOf(shown.revisions), seen)) {
      return null;
    }
    List<String> replaced = new List<String>();
    for (SetupMatch.Change change : shown.changes) {
      if (change.takesChoices && keys.contains(change.key)) {
        replaced.add(cellsOf(change));
      }
    }
    if (replaced.isEmpty()) {
      return null;
    }
    return 'Update ' +
      week.name +
      ' on ' +
      AgentSchedules.screenOf(week) +
      ' to match setup, replacing what was placed by hand: ' +
      String.join(replaced, '; ') +
      '. A lock on a replaced cell goes with it. The week as it is now is kept in Versions as "' +
      SetupMatch.BEFORE_UPDATE +
      '".';
  }

  public String run(Map<String, Object> body) {
    List<String> keys = keysOf(body.get('changes'));
    String seen = AgentFields.text(body, 'seen');
    if (String.isBlank(seen)) {
      throw new ShoreshException(
        'Send the seen read_setup_changes gave, so a change someone made since isn\'t replaced unseen.'
      );
    }
    AgentWeeks.Week week = AgentSchedules.eitherOf(body);
    // Held by eitherOf as its screen's update holds it (SetupMatch.make), then compared with what
    // was read.
    List<ScheduleDays.DayGrid> days = ScheduleDays.read(week.draft.Id);
    String stamp = WeekTickets.stamp(days);
    if (!WeekTickets.seenBlankNever(seenOf(stamp), seen)) {
      throw conflict(week);
    }
    Boolean kept = makeChanges(week, keys, stamp);
    String change = 'Update to match setup';
    Map<String, Object> undo = AgentUndoHeld.entry(
      week.draft.Id,
      'none',
      change
    );
    undo.put('version_name', kept ? SetupMatch.BEFORE_UPDATE : null);
    AgentUndoHeld.hold(undo);
    return 'Updated ' +
      week.name +
      ' on ' +
      AgentSchedules.screenOf(week) +
      ' to match setup (' +
      keys.size() +
      (keys.size() == 1 ? ' change' : ' changes') +
      ').' +
      (kept
        ? ' The week as it was is kept in Versions as "' +
          SetupMatch.BEFORE_UPDATE +
          '".'
        : '');
  }

  /**
   * The screens' own update of the changes named, on the week as read (stamp): whether it kept
   * the week first, as it does when a change replaces a placement made by hand.
   */
  private static Boolean makeChanges(
    AgentWeeks.Week week,
    List<String> keys,
    String stamp
  ) {
    SetupMatch.Ask ask = new SetupMatch.Ask();
    ask.keys = keys;
    ask.seenRevisions = stamp;
    // A new opening of the screen's list: it keeps its version when the screen would.
    ask.versionKept = false;
    SetupMatch.Updated result;
    try {
      result = SetupMatchController.updateToMatchSetup(week.draft.Id, ask);
    } catch (Exception e) {
      throw new ShoreshException(
        week.name + ' was not updated. ' + ScreenErrors.words(e)
      );
    }
    if (result.refused != null) {
      throw conflict(week);
    }
    return result.kept;
  }

  /** A change as read_setup_changes says it: its key, summary, and each cell before and after. */
  public static String said(SetupMatch.Change change) {
    return '[' +
      change.key +
      '] ' +
      (String.isBlank(change.summary) ? '' : change.summary + ': ') +
      cellsOf(change) +
      (change.takesChoices ? ' (replaces a placement made by hand)' : '') +
      '.';
  }

  /** Each cell of a change, before and after and why. */
  private static String cellsOf(SetupMatch.Change change) {
    List<String> lines = new List<String>();
    for (SetupMatch.Line line : change.lines) {
      lines.add(
        line.place +
          ': ' +
          line.before +
          ' -> ' +
          line.after +
          (String.isBlank(line.reason) ? '' : ' (' + line.reason + ')')
      );
    }
    return String.join(lines, '; ');
  }

  /** The week as read: its days' revisions, short. */
  public static String seenOf(String revisions) {
    return EncodingUtil.convertToHex(
        Crypto.generateDigest(
          'SHA-256',
          Blob.valueOf(revisions == null ? '' : revisions)
        )
      )
      .left(16);
  }

  private static AgentWeeks.ConflictException conflict(AgentWeeks.Week week) {
    return new AgentWeeks.ConflictException(
      'Someone changed ' +
        week.name +
        ' or setup since, so nothing was updated. Read it again with read_setup_changes.'
    );
  }

  /** The keys named, as a list; none is refused. */
  private static List<String> keysOf(Object value) {
    List<String> result = new List<String>();
    if (value instanceof List<Object>) {
      for (Object key : (List<Object>) value) {
        if (key != null && String.isNotBlank(String.valueOf(key))) {
          result.add(String.valueOf(key).trim());
        }
      }
    } else if (value != null && String.isNotBlank(String.valueOf(value))) {
      result.add(String.valueOf(value).trim());
    }
    if (result.isEmpty()) {
      throw new ShoreshException(
        'Say which changes to make (changes): their keys, as read_setup_changes gave them.'
      );
    }
    return result;
  }
}
