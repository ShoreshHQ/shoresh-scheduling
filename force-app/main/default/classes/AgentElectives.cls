/**
 * The Elective seats screen's run a request through an agent or the command line is about
 * (docs/protocol/api.md API-1.66 to API-1.68): the one the screen opens on for an elective set and
 * week (its Committed run, as finalize_electives finds it), and the run as the agent read it
 * (seen: its revision, the one the screen sends with every save).
 */
public with sharing class AgentElectives {
  /** The run asked for, with the names to say it by. */
  public class Run {
    public Id id;
    public String setName;
    public String weekName;
  }

  /** The Committed run for the set and week asked for; refused when final or not there. */
  public static Run committed(Map<String, Object> body) {
    AgentWeeks.requireScheduler();
    Season__c season = OutgoingRows.seasonCalled(
      AgentFields.text(body, 'season')
    );
    Week__c week = AgentWeeks.weekIn(season, AgentFields.text(body, 'week'));
    ElectiveSet__c electiveSet = AgentFinalize.setOf(
      season,
      AgentFields.text(body, 'elective_set')
    );
    Run result = new Run();
    result.setName = electiveSet.Name;
    result.weekName = week.Name;
    Boolean finalOnly = false;
    for (
      ElectiveSeats.RunInfo each : ElectiveSeatsController.seatsSetup(season.Id)
        .runs
    ) {
      if (each.setId == electiveSet.Id && each.weekId == week.Id) {
        if (each.status == ElectiveRunState.COMMITTED) {
          result.id = each.id;
          return result;
        }
        finalOnly = true;
      }
    }
    throw new ShoreshException(
      finalOnly
        ? electiveSet.Name +
          ' in ' +
          week.Name +
          ' is finalized, so its seats can\'t change. Start a new version on Elective seats first.'
        : 'No campers\' choices for ' +
          electiveSet.Name +
          ' in ' +
          week.Name +
          ' yet. Bring them in first (bring_in_camper_elective_choices).'
    );
  }

  /** The seen sent (the revision read_elective_seats_now gave); refused when left out. */
  public static Decimal seenOf(Map<String, Object> body) {
    Object seen = body.get('seen');
    try {
      return Decimal.valueOf(String.valueOf(seen).trim());
    } catch (Exception e) {
      throw new ShoreshException(
        'Send the seen read_elective_seats_now gave, so a change someone made since isn\'t replaced unseen.'
      );
    }
  }

  /**
   * The run locked until the request ends (as the screen's saves lock it, ElectiveRunState.held),
   * and refused (409) unless it is still as the agent read it: its revision, the screen's own
   * check (refuseUnlessCurrent), read alone so the whole run isn't read an extra time.
   */
  public static void holdAsSeen(Run run, Decimal seen) {
    List<ElectiveRun__c> now = [
      SELECT Revision__c
      FROM ElectiveRun__c
      WHERE Id = :run.id AND Status__c = :ElectiveRunState.COMMITTED
      WITH USER_MODE
      FOR UPDATE
    ];
    if (now.isEmpty() || now[0].Revision__c != seen) {
      throw new AgentWeeks.ConflictException(
        'Someone changed the seats in ' +
          run.setName +
          ' in ' +
          run.weekName +
          ' since, so nothing was changed. Read them again with read_elective_seats_now.'
      );
    }
  }

  /** Each camper's seats, said: "Monday, Period 1: Drama (locked)". */
  public static Map<Id, List<String>> seatsOf(
    ElectiveSeats.RunView view,
    Map<Id, String> offerings
  ) {
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
    return seats;
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
