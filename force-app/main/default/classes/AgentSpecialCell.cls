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
global with sharing class AgentSpecialCell implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'special',
    'kind',
    'change',
    'runs'
  };
  private static final Set<String> READ_FIELDS = new Set<String>{
    'season',
    'special',
    'kind'
  };

  @HttpGet
  global static void get() {
    RestResponse response = RestContext.response;
    response.addHeader('Content-Type', 'application/json');
    // An AI's read: it hears the screen's refusals without their advice (API-1.105).
    AgentRefusal.forAgent = true;
    try {
      AgentWeeks.requireScheduler();
      response.responseBody = Blob.valueOf(
        JSON.serialize(readOf(AgentSpecials.find(asked())), true)
      );
      response.statusCode = 200;
    } catch (Exception e) {
      Boolean ours =
        e instanceof ShoreshException || e instanceof AuraHandledException;
      response.statusCode = ours ? 400 : 500;
      response.responseBody = Blob.valueOf(
        JSON.serialize(
          OutgoingRows.answered(ours ? e.getMessage() : ScreenErrors.words(e))
        )
      );
    } finally {
      AgentRefusal.forAgent = false;
    }
  }

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentSpecialCell());
  }

  /** The fields the read was asked with; one Shoresh doesn't know is refused. */
  private static Map<String, Object> asked() {
    Map<String, Object> result = new Map<String, Object>();
    for (String key : RestContext.request.params.keySet()) {
      if (!READ_FIELDS.contains(key)) {
        throw new ShoreshException(
          'Shoresh doesn\'t know the field "' +
            key.left(40) +
            '". The fields are: kind, season, special.'
        );
      }
      result.put(key, RestContext.request.params.get(key));
    }
    return result;
  }

  /** What the page opens: the plan as its editor holds it, the season's setup and the camp's words. */
  public static Map<String, Object> readOf(AgentSpecials.Found found) {
    return new Map<String, Object>{
      'plan' => SpecialScheduleController.openPlan(found.owner.itemId),
      'setup' => SeasonSetupController.getSeasonSetup(found.owner.seasonId),
      'labels' => found.labels.all()
    };
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
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
