/**
 * Each offering over its seats at a time, as the Elective seats screen's "over Seats" problems
 * list them (c/shoreshElectiveSeats seats.js: a limited offering with more campers than seats),
 * said to an AI: "Swim is over its seats on Monday, Period 1: 3 of 2." A hand move may put an
 * offering over; it is shown, never refused (repo ADR 0018 choice 32), and never left unsaid.
 */
public with sharing class ElectiveOverSeats {
  public static List<String> of(ElectiveSeats.RunView view) {
    Map<Id, Id> groupOf = new Map<Id, Id>();
    for (ElectiveSeats.CamperInfo each : view.campers) {
      groupOf.put(each.id, each.groupId);
    }
    Map<String, Integer> counts = new Map<String, Integer>();
    for (ElectiveSeats.SeatInfo seat : view.seats) {
      String key = keyOf(seat.day, seat.blockId, seat.offeringId);
      counts.put(
        key + '|' + groupOf.get(seat.camperId),
        1 + (counts.get(key + '|' + groupOf.get(seat.camperId)) ?? 0)
      );
    }
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
