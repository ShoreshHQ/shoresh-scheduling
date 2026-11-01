/**
 * update_to_match_setup: "Update to match setup" on Generated Schedule or Manual Build, through an
 * agent or the command line (docs/protocol/api.md API-1.64). Web address /v1/update_to_match_setup,
 * POST {season, week, program, schedule, changes, seen}. It is the screens' own update
 * (SetupMatchController.updateToMatchSetup) of the changes named by key, done only while the week
 * is still as read_setup_changes read it (seen), with the week locked as its screen's save locks
 * it; otherwise refused (409), nothing changed. A version marked "Through an agent" is kept first,
 * so Undo brings the week back (AgentUndo).
 */
@RestResource(urlMapping='/v1/update_to_match_setup')
global with sharing class AgentUpdateToMatch implements AgentWeeks.Action {
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
    AgentWeeks.answer(new AgentUpdateToMatch());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    List<String> keys = keysOf(body.get('changes'));
    String seen = AgentFields.text(body, 'seen');
    if (String.isBlank(seen)) {
      throw new ShoreshException(
        'Send the seen read_setup_changes gave, so a change someone made since isn\'t replaced unseen.'
      );
    }
    AgentWeeks.Week week = AgentSchedules.eitherOf(body);
    List<ScheduleDays.DayGrid> days = ScheduleDays.read(week.draft.Id);
    String stamp = ScheduleDays.stamp(days);
    if (seenOf(stamp) != seen) {
      throw conflict(week);
    }
    Id versionId = AgentWeeks.keepBefore(
      week.draft,
      days,
      'Update to match setup'
    );
    SetupMatch.Ask ask = new SetupMatch.Ask();
    ask.keys = keys;
    ask.seenRevisions = stamp;
    // The version just kept is the way back: the update keeps no second one.
    ask.versionKept = true;
    SetupMatch.Updated result;
    try {
      // The screens' own update.
      result = SetupMatchController.updateToMatchSetup(week.draft.Id, ask);
    } catch (Exception e) {
      throw new ShoreshException(
        week.name + ' was not updated. ' + ScreenErrors.words(e)
      );
    }
    if (result.refused != null) {
      throw conflict(week);
    }
    AgentWeeks.changed(versionId, week.draft.Id);
    return 'Updated ' +
      week.name +
      ' on ' +
      AgentSchedules.screenOf(week) +
      ' to match setup (' +
      keys.size() +
      (keys.size() == 1 ? ' change' : ' changes') +
      '). undo_last_agent_change brings it back.';
  }

  /** A change as read_setup_changes says it: its key, summary, and each cell before and after. */
  public static String said(SetupMatch.Change change) {
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
    return '[' +
      change.key +
      '] ' +
      (String.isBlank(change.summary) ? '' : change.summary + ': ') +
      String.join(lines, '; ') +
      (change.takesChoices ? ' (replaces a placement made by hand)' : '') +
      '.';
  }

  /** The week as read: its days' revisions, short (AgentWeeks.fingerprint). */
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
