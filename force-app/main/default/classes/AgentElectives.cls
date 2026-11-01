/**
 * The Elective seats screen's run a request through an agent or the command line is about
 * (docs/protocol/api.md API-1.66 to API-1.68): the one the screen opens on for an elective set and
 * week (its Committed run, as finalize_electives finds it), and the run as the agent read it
 * (seen: the run and its revision, the one the screen sends with every save).
 */
public with sharing class AgentElectives {
  /** The run asked for, with the names to say it by. */
  public class Run {
    public Id id;
    public String setName;
    public String weekName;
    // True for a finalized run (read, or a new version started from it), never changed.
    public Boolean isFinal = false;
  }

  /** The Committed run for the set and week asked for; refused when final or not there. */
  public static Run committed(Map<String, Object> body) {
    Found found = find(body);
    if (found.committedId == null) {
      throw found.missing();
    }
    found.run.id = found.committedId;
    return found.run;
  }

  /**
   * The run the screen opens on for the set and week: its Committed one, or its latest final one
   * when none is being worked on; refused when there is neither.
   */
  public static Run committedOrFinal(Map<String, Object> body) {
    Found found = find(body);
    if (found.committedId != null) {
      found.run.id = found.committedId;
    } else if (found.finalRun != null) {
      found.run.id = found.finalRun.id;
      found.run.isFinal = true;
    } else {
      throw found.missing();
    }
    return found.run;
  }

  /** The set and week's runs as Elective seats lists them. */
  private class Found {
    Run run = new Run();
    Id committedId;
    ElectiveSeats.RunInfo finalRun;

    ShoreshException missing() {
      String place = run.setName + ' in ' + run.weekName;
      return new ShoreshException(
        finalRun != null
          ? place +
            ' is finalized, so its seats can\'t change. Start a new version first (start_new_elective_version).'
          : 'No campers\' choices for ' +
            place +
            ' yet. Bring them in first (bring_in_camper_elective_choices).'
      );
    }
  }

  private static Found find(Map<String, Object> body) {
    AgentWeeks.requireScheduler();
    Season__c season = OutgoingRows.seasonCalled(
      AgentFields.text(body, 'season')
    );
    Week__c week = AgentWeeks.weekIn(season, AgentFields.text(body, 'week'));
    ElectiveSet__c electiveSet = AgentFinalize.setOf(
      season,
      AgentFields.text(body, 'elective_set')
    );
    Found found = new Found();
    found.run.setName = electiveSet.Name;
    found.run.weekName = week.Name;
    for (
      ElectiveSeats.RunInfo each : ElectiveSeatsController.seatsSetup(season.Id)
        .runs
    ) {
      if (each.setId != electiveSet.Id || each.weekId != week.Id) {
        continue;
      }
      if (each.status == ElectiveRunState.COMMITTED) {
        found.committedId = each.id;
      } else if (
        found.finalRun == null ||
        found.finalRun.finalizedAt == null ||
        each.finalizedAt > found.finalRun.finalizedAt
      ) {
        found.finalRun = each;
      }
    }
    return found;
  }

  /** The run as read, as read_elective_seats_now says it: "<run Id>:<revision>". */
  public static String seenText(Id runId, Decimal revision) {
    return String.valueOf(runId) + ':' + revision;
  }

  /**
   * The revision of the seen sent (read_elective_seats_now's); refused when left out or
   * unreadable, and (409) when it is another run's: a version started or replaced since.
   */
  public static Decimal seenOf(Map<String, Object> body, Run run) {
    String seen = String.valueOf(body.get('seen') ?? '').trim();
    Decimal revision;
    try {
      revision = Decimal.valueOf(seen.substringAfterLast(':'));
    } catch (Exception e) {
      throw new ShoreshException(
        'Send the seen read_elective_seats_now gave, so a change someone made since isn\'t replaced unseen.'
      );
    }
    if (!seen.substringBeforeLast(':').equals(String.valueOf(run.id))) {
      throw changedSince(run);
    }
    return revision;
  }

  /**
   * The run locked until the request ends (as the screen's saves lock it, ElectiveRunState.held),
   * and refused (409) unless it is still as the agent read it: its revision, the screen's own
   * check (refuseUnlessCurrent), read alone so the whole run isn't read an extra time.
   */
  public static void holdAsSeen(Run run, Decimal seen) {
    String status = run.isFinal
      ? ElectiveRunState.FINAL_STATUS
      : ElectiveRunState.COMMITTED;
    List<ElectiveRun__c> now = [
      SELECT Revision__c
      FROM ElectiveRun__c
      WHERE Id = :run.id AND Status__c = :status
      WITH USER_MODE
      FOR UPDATE
    ];
    if (now.isEmpty() || now[0].Revision__c != seen) {
      throw changedSince(run);
    }
  }

  private static AgentWeeks.ConflictException changedSince(Run run) {
    return new AgentWeeks.ConflictException(
      'Someone changed the seats in ' +
        run.setName +
        ' in ' +
        run.weekName +
        ' since, so nothing was changed. Read them again with read_elective_seats_now.'
    );
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
