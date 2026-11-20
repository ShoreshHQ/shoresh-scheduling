/**
 * change_special_schedule_cell: one cell of a special day's or event's own schedule typed in, as
 * typing in it on its page does, through an agent or the command line (docs/protocol/api.md
 * API-1.77). Web address /v1/change_special_schedule_cell, in two halves, as cell edits on a week
 * are (API-1.11): the typing is worked out where the page works it out, outside Salesforce, by the
 * week editor the page types through (c/shoreshWeekEditor handEdits.js placeStep, specials.js
 * placeOverStep, run by the connector), and saved here by the page's own save:
 *   GET  ?season=&special=&kind=  what the page opens (SpecialScheduleController.openPlan), the
 *        season's setup and the camp's words
 *   POST {season, special, kind, change, runs}  the runs the page would send, saved by its own
 *        save (SpecialScheduleController.saveCells), each made only while its cells hold what the
 *        agent saw, so someone else's change is never replaced unseen.
 * Its Undo is the page's: the connector holds the runs back for the conversation and sends them to
 * undo_last_change (API-1.14).
 */
@RestResource(urlMapping='/v1/change_special_schedule_cell')
global with sharing class AgentSpecialCell implements AgentRequest.Change {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'special',
    'kind',
    'change',
    'runs'
  };

  @HttpGet
  global static void get() {
    AgentRequest.answer(new WhatThePageOpens());
  }

  @HttpPost
  global static void post() {
    AgentRequest.answer(new AgentSpecialCell());
  }

  /** The GET: what the page opens (readOf). */
  private with sharing class WhatThePageOpens implements AgentRequest.Read {
    public Set<String> fields() {
      return new Set<String>{ 'season', 'special', 'kind' };
    }

    public String run(Map<String, Object> asked) {
      AgentWeeks.requireScheduler();
      return JSON.serialize(
        AgentSpecialCell.readOf(AgentSpecials.find(asked)),
        true
      );
    }
  }

  /** What the page opens: the plan as its editor holds it, the season's setup and the camp's words. */
  public static Map<String, Object> readOf(AgentSpecials.Found found) {
    return new Map<String, Object>{
      'plan' => SpecialScheduleController.openPlan(found.owner.itemId),
      'setup' => SeasonSetupController.getSeasonSetup(found.owner.seasonId),
      'labels' => found.labels.all()
    };
  }

  public String run(Map<String, Object> body) {
    AgentSpecials.Found found = AgentSpecials.find(body);
    String change = AgentFields.text(body, 'change');
    SlotEdits.Edit edit = new SlotEdits.Edit();
    edit.runs = AgentCells.runsOf(body.get('runs'));
    if (String.isBlank(change) || edit.runs.isEmpty()) {
      throw new ShoreshException(
        'That change could not be read. Download Shoresh\'s connector again from Settings in Shoresh.'
      );
    }
    save(found.owner.itemId, edit, change);
    // Its Undo, as the page's history holds it: the connector holds the runs back (API-1.14).
    AgentUndoHeld.hold(AgentUndoHeld.entry(found.owner.itemId, 'edit', change));
    return change + '.';
  }

  /** The page's own save of the runs; a cell changed since is a conflict, nothing changed. */
  private static void save(Id itemId, SlotEdits.Edit edit, String change) {
    SlotEdits.Result result;
    try {
      result = SpecialScheduleController.saveCells(
        itemId,
        new List<SlotEdits.Edit>{ edit }
      );
    } catch (Exception e) {
      throw new ShoreshException(
        'Nothing was changed. ' + ScreenErrors.words(e)
      );
    }
    if (!result.conflicts.isEmpty()) {
      throw new AgentWeeks.ConflictException(
        'Changed by someone else since you read it: ' +
          change +
          '. Nothing was changed. Read it again with read_special_schedule.'
      );
    }
  }
}
