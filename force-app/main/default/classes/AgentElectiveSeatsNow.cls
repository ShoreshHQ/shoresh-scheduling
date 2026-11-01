/**
 * read_elective_seats_now: the seats on the Elective seats screen for an elective set and week as
 * they are now, finalized or not, through an agent or the command line (docs/protocol/api.md
 * API-1.66). Web address /v1/elective_seats_now, GET ?season=&week=&elective_set=. It is the
 * screen's own read of its run (ElectiveSeatsController.openRun): each time and what is offered
 * then, and each camper's seats, locked or moved by hand, with the run as read (seen).
 */
@RestResource(urlMapping='/v1/elective_seats_now')
global with sharing class AgentElectiveSeatsNow {
  @HttpGet
  global static void get() {
    RestResponse response = RestContext.response;
    response.addHeader('Content-Type', 'application/json');
    try {
      Map<String, Object> asked = new Map<String, Object>();
      for (
        String field : new List<String>{ 'season', 'week', 'elective_set' }
      ) {
        asked.put(field, RestContext.request.params.get(field));
      }
      AgentElectives.Run run = AgentElectives.committed(asked);
      response.statusCode = 200;
      response.responseBody = Blob.valueOf(
        JSON.serialize(
          new Map<String, String>{
            'message' => said(run, ElectiveSeatsController.openRun(run.id))
          }
        )
      );
    } catch (Exception e) {
      Boolean ours =
        e instanceof ShoreshException || e instanceof AuraHandledException;
      response.statusCode = ours ? 400 : 500;
      response.responseBody = Blob.valueOf(
        JSON.serialize(
          new Map<String, String>{
            'message' => ours ? e.getMessage() : ScreenErrors.loadingWords(e)
          }
        )
      );
    }
  }

  /** The run as the screen shows it, in lines. */
  public static String said(
    AgentElectives.Run run,
    ElectiveSeats.RunView view
  ) {
    Map<Id, String> offerings = new Map<Id, String>();
    for (ElectiveSeats.OfferingInfo each : view.offerings) {
      offerings.put(each.id, each.name);
    }
    Map<Id, String> groups = new Map<Id, String>();
    for (ElectiveSeats.GroupInfo each : view.groups) {
      groups.put(each.id, each.name);
    }
    List<String> lines = new List<String>{
      run.setName +
      ' in ' +
      run.weekName +
      ': ' +
      (view.assigned ? 'seats assigned' : 'seats not assigned yet') +
      ', not finalized. seen: ' +
      view.revision
    };
    if (view.scheduleChanged) {
      lines.add('Schedule changed since seats were assigned: assign again.');
    }
    lines.add('Times:');
    for (ElectivePeriod period : view.times) {
      List<String> offered = new List<String>();
      for (Id offeringId : period.offeringIds) {
        offered.add(offerings.get(offeringId));
      }
      List<String> who = new List<String>();
      for (Id groupId : period.groupIds) {
        who.add(groups.get(groupId));
      }
      lines.add(
        '- ' +
          period.words() +
          (who.isEmpty() ? '' : ' (' + String.join(who, ', ') + ')') +
          ': ' +
          (offered.isEmpty() ? 'nothing offered' : String.join(offered, ', '))
      );
    }
    Map<Id, List<String>> seats = new Map<Id, List<String>>();
    for (ElectiveSeats.SeatInfo seat : view.seats) {
      if (!seats.containsKey(seat.camperId)) {
        seats.put(seat.camperId, new List<String>());
      }
      seats.get(seat.camperId)
        .add(
          wordsOf(seat.day, seat.blockId, view.times) +
            ': ' +
            offerings.get(seat.offeringId) +
            (seat.locked ? ' (locked)' : '') +
            (seat.byHand ? ' (moved by hand)' : '')
        );
    }
    lines.add('Campers:');
    for (ElectiveSeats.CamperInfo camper : view.campers) {
      List<String> has = seats.get(camper.id);
      lines.add(
        '- ' +
          camper.name +
          (String.isBlank(camper.camperNumber)
            ? ''
            : ' #' + camper.camperNumber) +
          (camper.groupId == null ? '' : ', ' + groups.get(camper.groupId)) +
          ': ' +
          (has == null ? 'no seats' : String.join(has, '; '))
      );
    }
    return String.join(lines, '\n');
  }

  private static String wordsOf(
    Date day,
    Id blockId,
    List<ElectivePeriod> times
  ) {
    for (ElectivePeriod period : times) {
      if (period.day == day && period.blockId == blockId) {
        return period.words();
      }
    }
    return String.valueOf(day);
  }
}
