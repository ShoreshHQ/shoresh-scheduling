/**
 * What Finalize refuses (ELECT-5.7, word walk W6): each offering over its seats at one of the
 * run's times now, in the words the seats screen uses for it (ElectiveOverSeats): "Drama is over
 * its seats on Monday, Period 1: 2 of 1." While the seats are a draft a hand move may put an
 * offering over and it is only shown (ELECT-4.5); a final run is never over.
 */
public with sharing class ElectiveOverAtFinalize {
  private final ElectiveRunState state;
  private final List<String> order = new List<String>();
  private final Map<String, Integer> counts = new Map<String, Integer>();
  private final Map<String, ElectivePeriod> periods = new Map<String, ElectivePeriod>();
  private final Map<String, Offering__c> offerings = new Map<String, Offering__c>();

  public ElectiveOverAtFinalize(ElectiveRunState state) {
    this.state = state;
  }

  /** Each line, in the order the run's seats are read; empty when none is over. */
  public List<String> find() {
    DayWords.use(state.run.Season__c);
    for (Assignment__c seat : state.seats) {
      count(seat);
    }
    List<String> lines = new List<String>();
    for (String key : order) {
      Offering__c offering = offerings.get(key);
      if (counts.get(key) > offering.Seats__c) {
        lines.add(lineFor(key, offering));
      }
    }
    return lines;
  }

  /** The seat counted at its time now; a seat with no time now is refused before this. */
  private void count(Assignment__c seat) {
    ElectivePeriod at = state.live.periodOf(
      state.groupOf(seat.Camper__c),
      seat.Date__c,
      ElectiveSeatChecks.blockOf(seat)
    );
    Offering__c offering = state.offeringsById.get(seat.Offering__c);
    if (at == null || !limited(offering)) {
      return;
    }
    String key = at.key + '|' + seat.Offering__c;
    if (!counts.containsKey(key)) {
      order.add(key);
      periods.put(key, at);
      offerings.put(key, offering);
    }
    counts.put(key, 1 + (counts.get(key) ?? 0));
  }

  private String lineFor(String key, Offering__c offering) {
    return offering.Activity__r.Name +
      ' is over its ' +
      state.labels().pluralInSentence('Seats') +
      ' on ' +
      periods.get(key).words() +
      ': ' +
      counts.get(key) +
      ' of ' +
      offering.Seats__c.intValue() +
      '.';
  }

  /** Blank or 0 seats, or no limit, are no limit (ELECT-4.1). */
  private static Boolean limited(Offering__c offering) {
    return offering != null &&
      offering.NoSeatLimit__c != true &&
      offering.Seats__c != null &&
      offering.Seats__c != 0;
  }
}
