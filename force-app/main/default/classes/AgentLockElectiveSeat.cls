/**
 * lock_elective_seat: one camper's elective seat locked or unlocked without moving it, as the
 * roster's padlock on the Elective seats screen does, through an agent or the command line
 * (docs/protocol/api.md API-1.69). Web address /v1/lock_elective_seat, POST {season, week,
 * elective_set, camper, day, time, locked, seen}. It is the screen's own change of one seat
 * (ElectiveSeatsController.changeSeat with locked), done only while the run is still as the agent
 * read it (seen), with the run locked; otherwise refused (409), nothing changed.
 */
@RestResource(urlMapping='/v1/lock_elective_seat')
global with sharing class AgentLockElectiveSeat implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'elective_set',
    'camper',
    'day',
    'time',
    'locked',
    'seen'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentLockElectiveSeat());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    if (!(body.get('locked') instanceof Boolean)) {
      throw new ShoreshException(
        'Say whether to lock the seat (locked: true) or unlock it (locked: false).'
      );
    }
    Boolean locked = (Boolean) body.get('locked');
    AgentElectives.Run run = AgentElectives.committed(body);
    Decimal seen = AgentElectives.seenOf(body);
    AgentElectives.holdAsSeen(run, seen);
    ElectiveSeats.RunView view = ElectiveSeatsController.openRun(run.id);
    ElectiveSeats.CamperInfo camper = AgentMoveElectiveSeat.camperOf(
      view,
      AgentFields.text(body, 'camper')
    );
    ElectivePeriod period = AgentMoveElectiveSeat.timeOf(
      view,
      AgentFields.text(body, 'day'),
      AgentFields.text(body, 'time')
    );
    try {
      // The screen's own padlock.
      ElectiveSeatsController.changeSeat(
        JSON.serialize(
          new Map<String, Object>{
            'runId' => run.id,
            'revision' => seen,
            'camperId' => camper.id,
            'day' => period.day,
            'blockId' => period.blockId,
            'locked' => locked
          }
        )
      );
    } catch (Exception e) {
      throw new ShoreshException(
        'That seat wasn\'t changed. ' + ScreenErrors.words(e)
      );
    }
    // The screen's own words for it.
    return (locked ? 'Locked ' : 'Unlocked ') + camper.name + '.';
  }
}
