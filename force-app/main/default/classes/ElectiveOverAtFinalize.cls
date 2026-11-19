/**
 * What Finalize refuses (ELECT-5.7, word walk W6): each offering over its seats at one of the
 * run's times now, in the words the seats screen uses for it (ElectiveOverSeats): "Drama is over
 * its seats on Monday, Period 1: 2 of 1." While the seats are a draft a hand move may put an
 * offering over and it is only shown (ELECT-4.5); a final run is never over.
 */
public with sharing class ElectiveOverAtFinalize {
  private final ElectiveRunState state;

  public ElectiveOverAtFinalize(ElectiveRunState state) {
    this.state = state;
  }

  /** Each line, in the order the run's seats are read; empty when none is over. */
  public List<String> find() {
    DayWords.use(state.run.Season__c);
    // A seat with no time now is refused before this.
    ElectiveSeatCounts counts = new ElectiveSeatCounts(state.live.periods);
    for (Assignment__c seat : state.seats) {
      counts.seat(
        state.groupOf(seat.Camper__c),
        ElectiveTimes.slotOf(seat.Date__c, ElectiveSeatChecks.blockOf(seat)),
        seat.Offering__c
      );
    }
    List<String> lines = new List<String>();
    for (ElectiveSeatCounts.Counted each : counts.counted()) {
      Offering__c offering = state.offeringsById.get(each.offeringId);
      Integer seats = ElectiveSeatCounts.limitOf(offering);
      if (seats != null && each.count > seats) {
        lines.add(lineFor(each, offering, seats));
      }
    }
    return lines;
  }

  private String lineFor(
    ElectiveSeatCounts.Counted each,
    Offering__c offering,
    Integer seats
  ) {
    return offering.Activity__r.Name +
      ' is over its ' +
      state.labels().pluralInSentence('Seats') +
      ' on ' +
      each.period.words() +
      ': ' +
      each.count +
      ' of ' +
      seats +
      '.';
  }
}
