/**
 * An elective offering's seat limit, and how many campers sit in it at each elective time, as the
 * Elective seats screen counts them (c/shoreshElectiveSeats seats.js; repo ADR 0018 choices 31,
 * 32 and 36). Assign seats' check, the seats said to an AI, Finalize and Roots all ask this, so
 * none shows an offering over its seats, or kept below its minimum, that the screen does not
 * (ELECT-4.11). Both sides pass staticresources/ShoreshSeatExamples.json. Reads nothing.
 */
public with sharing class ElectiveSeatCounts {
  /** One offering at one time, with the campers seated in it then. */
  public class Counted {
    public ElectivePeriod period;
    public Id offeringId;
    public Integer count = 0;
  }

  // day|block -> the times there, in division order.
  private final Map<String, List<ElectivePeriod>> bySlot = new Map<String, List<ElectivePeriod>>();
  // time key|offering -> its count; and each, in the order first counted.
  private final Map<String, Counted> counts = new Map<String, Counted>();
  private final List<Counted> order = new List<Counted>();

  /**
   * The offering's seats, or null for no limit: no seat limit ticked, or seats blank or 0
   * (ELECT-4.1; the engine's NO_SEATS_SET).
   */
  public static Integer limitOf(Decimal seats, Boolean noLimit) {
    return noLimit == true ||
      seats == null ||
      seats == 0
      ? null
      : seats.intValue();
  }

  public static Integer limitOf(Offering__c offering) {
    return limitOf(offering.Seats__c, offering.NoSeatLimit__c);
  }

  /** Counts at these times (one run's, as ElectiveTimes makes them). */
  public ElectiveSeatCounts(List<ElectivePeriod> times) {
    for (ElectivePeriod each : times) {
      String slot = ElectiveTimes.slotOf(each.day, each.blockId);
      if (!bySlot.containsKey(slot)) {
        bySlot.put(slot, new List<ElectivePeriod>());
      }
      bySlot.get(slot).add(each);
    }
  }

  /**
   * A seat, counted at the time the camper's bunk (groupId; null for no bunk) takes on that day
   * and block (ElectiveTimes.periodOf's rule), when that time offers its offering; else not at
   * all, as the screen leaves a seat that no longer fits off its board.
   */
  public void seat(Id groupId, Date day, String blockId, Id offeringId) {
    List<ElectivePeriod> here = bySlot.get(ElectiveTimes.slotOf(day, blockId));
    ElectivePeriod at = here == null
      ? null
      : ElectiveTimes.takenBy(here, groupId);
    if (at != null) {
      add(at, offeringId);
    }
  }

  /** A seat at a time already found (Assign's), when that time offers its offering. */
  public void add(ElectivePeriod at, Id offeringId) {
    if (!at.offeringIds.contains(offeringId)) {
      return;
    }
    String key = at.key + '|' + offeringId;
    Counted found = counts.get(key);
    if (found == null) {
      found = new Counted();
      found.period = at;
      found.offeringId = offeringId;
      counts.put(key, found);
      order.add(found);
    }
    found.count++;
  }

  /** The campers in the offering at that time (0 when none). */
  public Integer at(ElectivePeriod period, Id offeringId) {
    Counted found = counts.get(period.key + '|' + offeringId);
    return found == null ? 0 : found.count;
  }

  /** Each offering at each time it has campers, in the order first counted. */
  public List<Counted> counted() {
    return order;
  }
}
