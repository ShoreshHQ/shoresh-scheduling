/**
 * Each offering over its seats at a time, as the Elective seats screen's "over Seats" problems
 * list them (c/shoreshElectiveSeats seats.js: a limited offering with more campers than seats),
 * said to an AI: "Swim is over its seats on Monday, Period 1: 3 of 2." A hand move may put an
 * offering over; it is shown, never refused (repo ADR 0018 choice 32; ELECT-4.5), and never left
 * unsaid.
 */
public with sharing class ElectiveOverSeats {
  public static List<String> of(ElectiveSeats.RunView view) {
    Map<String, Integer> counts = countsOf(view);
    List<String> lines = new List<String>();
    for (ElectivePeriod period : view.times) {
      for (ElectiveSeats.OfferingInfo offering : view.offerings) {
        if (period.offeringIds.contains(offering.id) && limited(offering)) {
          String over = overWords(
            period,
            offering,
            countIn(counts, period, offering)
          );
          if (over != null) {
            lines.add(over);
          }
        }
      }
    }
    return lines;
  }

  /**
   * The offering the camper sits in on that day and block, if it is over its seats then, or null:
   * a time is per division, so another division's campers in it then are not counted.
   */
  public static String atCampersTime(
    ElectiveSeats.RunView view,
    ElectiveSeats.CamperInfo camper,
    ElectivePeriod at
  ) {
    Id offeringId = seatedIn(view, camper, at);
    for (ElectivePeriod period : view.times) {
      Boolean campersTime =
        period.day == at.day &&
        period.blockId == at.blockId &&
        period.groupIds.contains(camper.groupId);
      for (ElectiveSeats.OfferingInfo offering : view.offerings) {
        if (campersTime && offering.id == offeringId && limited(offering)) {
          return overWords(
            period,
            offering,
            countIn(countsOf(view), period, offering)
          );
        }
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
      !limited(offering)
      ? 'Choose how many seats "' +
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

  /** Campers per offering then, by group. */
  private static Map<String, Integer> countsOf(ElectiveSeats.RunView view) {
    Map<Id, Id> groupOf = new Map<Id, Id>();
    for (ElectiveSeats.CamperInfo each : view.campers) {
      groupOf.put(each.id, each.groupId);
    }
    Map<String, Integer> counts = new Map<String, Integer>();
    for (ElectiveSeats.SeatInfo seat : view.seats) {
      String key =
        keyOf(seat.day, seat.blockId, seat.offeringId) +
        '|' +
        groupOf.get(seat.camperId);
      counts.put(key, 1 + (counts.get(key) ?? 0));
    }
    return counts;
  }

  /** Blank or 0 seats are no limit, as the seat run and the screen use them (ELECT-4.1). */
  private static Boolean limited(ElectiveSeats.OfferingInfo offering) {
    return offering.noLimit != true &&
      offering.seats != null &&
      offering.seats != 0;
  }

  private static String keyOf(Date day, String blockId, Id offeringId) {
    return day + '|' + blockId + '|' + offeringId;
  }

  /** The period's campers (its groups') in the offering then. */
  private static Integer countIn(
    Map<String, Integer> counts,
    ElectivePeriod period,
    ElectiveSeats.OfferingInfo offering
  ) {
    String key = keyOf(period.day, period.blockId, offering.id);
    Integer count = 0;
    for (Id groupId : period.groupIds) {
      count += counts.get(key + '|' + groupId) ?? 0;
    }
    return count;
  }

  private static String overWords(
    ElectivePeriod period,
    ElectiveSeats.OfferingInfo offering,
    Integer count
  ) {
    return count > offering.seats
      ? offering.name +
        ' is over its seats on ' +
        period.words() +
        ': ' +
        count +
        ' of ' +
        offering.seats.intValue() +
        '.'
      : null;
  }
}
