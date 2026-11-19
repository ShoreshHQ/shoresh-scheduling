/**
 * Each offering over its seats at a time, as the Elective seats screen's "over Seats" problems
 * list them (c/shoreshElectiveSeats seats.js: a limited offering with more campers than seats),
 * said to an AI: "Swim is over its seats on Monday, Period 1: 3 of 2." A hand move may put an
 * offering over; it is shown, never refused (repo ADR 0018 choice 32; ELECT-4.5), and never left
 * unsaid.
 */
public with sharing class ElectiveOverSeats {
  // The camp's words these lines are said in (use()): "over its spots" (word walk W1).
  private static CampLabels words = CampLabels.modelTermsOnly();

  /** The camp's words for the lines said after this, as DayWords.use does for days. */
  public static void use(CampLabels labels) {
    words = labels;
  }

  public static List<String> of(ElectiveSeats.RunView view) {
    ElectiveSeatCounts counts = countsOf(view);
    List<String> lines = new List<String>();
    for (ElectivePeriod period : view.times) {
      for (ElectiveSeats.OfferingInfo offering : view.offerings) {
        String over = overWords(period, offering, counts);
        if (over != null) {
          lines.add(over);
        }
      }
    }
    return lines;
  }

  /**
   * The offering the camper sits in on that day and block, if it is over its seats at the time
   * the camper takes then, or null: a time is per division, so another division's campers in it
   * then are not counted.
   */
  public static String atCampersTime(
    ElectiveSeats.RunView view,
    ElectiveSeats.CamperInfo camper,
    ElectivePeriod at
  ) {
    Id offeringId = seatedIn(view, camper, at);
    List<ElectivePeriod> here = new List<ElectivePeriod>();
    for (ElectivePeriod period : view.times) {
      if (period.day == at.day && period.blockId == at.blockId) {
        here.add(period);
      }
    }
    ElectivePeriod campersTime = here.isEmpty()
      ? null
      : ElectiveTimes.takenBy(here, camper.groupId);
    for (ElectiveSeats.OfferingInfo offering : view.offerings) {
      if (campersTime != null && offering.id == offeringId) {
        return overWords(campersTime, offering, countsOf(view));
      }
    }
    return null;
  }

  /**
   * The screen's "needs its seats chosen" for an offering on the table with blank or 0 seats,
   * seated with no limit (ELECT-4.1), or null.
   */
  public static String noSeatsSet(ElectiveSeats.OfferingInfo offering) {
    return offering.proposed != true &&
      offering.noLimit != true &&
      ElectiveSeatCounts.limitOf(offering.seats, offering.noLimit) == null
      ? 'Choose how many ' +
        words.pluralInSentence('Seats') +
        ' "' +
        offering.name +
        '" has: none are set, so it is seated with no limit.'
      : null;
  }

  /** Each offering's "needs its seats chosen" line, in the screen's order (ELECT-4.1). */
  public static List<String> noSeatsSet(ElectiveSeats.RunView view) {
    List<String> lines = new List<String>();
    for (ElectiveSeats.OfferingInfo offering : view.offerings) {
      String unset = noSeatsSet(offering);
      if (unset != null) {
        lines.add(unset);
      }
    }
    return lines;
  }

  /** The offering the camper sits in on that day and block, or null. */
  private static Id seatedIn(
    ElectiveSeats.RunView view,
    ElectiveSeats.CamperInfo camper,
    ElectivePeriod at
  ) {
    for (ElectiveSeats.SeatInfo seat : view.seats) {
      if (
        seat.camperId == camper.id &&
        seat.day == at.day &&
        seat.blockId == at.blockId
      ) {
        return seat.offeringId;
      }
    }
    return null;
  }

  /** Campers per offering at each of the view's times, as the screen counts them. */
  private static ElectiveSeatCounts countsOf(ElectiveSeats.RunView view) {
    Map<Id, ElectiveSeats.CamperInfo> campers = new Map<Id, ElectiveSeats.CamperInfo>();
    for (ElectiveSeats.CamperInfo each : view.campers) {
      campers.put(each.id, each);
    }
    ElectiveSeatCounts counts = new ElectiveSeatCounts(view.times);
    for (ElectiveSeats.SeatInfo seat : view.seats) {
      ElectiveSeats.CamperInfo camper = campers.get(seat.camperId);
      if (camper != null) {
        counts.seat(camper.groupId, seat.day, seat.blockId, seat.offeringId);
      }
    }
    return counts;
  }

  /** "Swim is over its seats on Monday, Period 1: 3 of 2.", or null when it is not over then. */
  private static String overWords(
    ElectivePeriod period,
    ElectiveSeats.OfferingInfo offering,
    ElectiveSeatCounts counts
  ) {
    Integer seats = ElectiveSeatCounts.limitOf(
      offering.seats,
      offering.noLimit
    );
    Integer count = counts.at(period, offering.id);
    return seats != null &&
      count > seats
      ? offering.name +
        ' is over its ' +
        words.pluralInSentence('Seats') +
        ' on ' +
        period.words() +
        ': ' +
        count +
        ' of ' +
        seats +
        '.'
      : null;
  }
}
