/**
 * The seats Assign seats sends as part of a linked choice (electives slice E8; repo ADR 0018
 * choice 42; desktop ADR 2026-09-29-linked-elective-bundles; plan §5: the server never trusts the
 * browser blindly): each is a linked choice of the run's set, in that linked choice's offering, at
 * one of its periods (a weekday and a time block), at a time whose division it applies to; and a
 * camper placed in a linked choice is placed in every one of its periods this run can give it
 * (the run has that period for their division and offers the linked choice's offering there),
 * all or none. A period it can't give is left out, not refused (engine care PR 8; Greg, Q13).
 * Reads nothing: the run's linked choices and times come with ElectiveRunState. No message
 * names a camper.
 */
public with sharing class ElectiveLinkedSeats {
  private Map<Id, LinkedChoice__c> byId;
  private ElectiveTimes live;
  // camper|linked choice -> the periods ("Tuesday|<block>") sent.
  private Map<String, Set<String>> sent = new Map<String, Set<String>>();
  // camper|linked choice -> the division of the times sent.
  private Map<String, Id> divisionOf = new Map<String, Id>();

  public ElectiveLinkedSeats(ElectiveRunState runState) {
    byId = new Map<Id, LinkedChoice__c>(runState.linkedChoices);
    live = runState.live;
  }

  /** Checks one seat sent; a seat that is not part of a linked choice has nothing to check. */
  public void add(ElectiveSeatSaves.SeatIn seat, ElectivePeriod at) {
    if (seat.linkedChoiceId == null) {
      return;
    }
    LinkedChoice__c choice = byId.get(seat.linkedChoiceId);
    if (choice == null || choice.Offering__c != seat.offeringId) {
      throw refused();
    }
    String period = periodKey(LinkedChoicePlaces.weekdayOf(at.day), at.blockId);
    if (!periodsOf(choice).contains(period) || !appliesTo(choice, at)) {
      throw refused();
    }
    String key = seat.camperId + '|' + choice.Id;
    if (!sent.containsKey(key)) {
      sent.put(key, new Set<String>());
      divisionOf.put(key, at.divisionId);
    }
    sent.get(key).add(period);
  }

  /** A camper placed in a linked choice has a seat in every one of its periods this run can give. */
  public void refuseIncomplete() {
    for (String key : sent.keySet()) {
      LinkedChoice__c choice = byId.get(Id.valueOf(key.substringAfter('|')));
      if (!sent.get(key).equals(givenPeriods(choice, divisionOf.get(key)))) {
        throw refused();
      }
    }
  }

  /** Its periods the run has for the division with its offering offered there. */
  private Set<String> givenPeriods(LinkedChoice__c choice, Id divisionId) {
    Set<String> given = new Set<String>();
    for (ElectivePeriod each : live.periods) {
      if (
        each.divisionId == divisionId &&
        each.offeringIds.contains(choice.Offering__c)
      ) {
        given.add(
          periodKey(LinkedChoicePlaces.weekdayOf(each.day), each.blockId)
        );
      }
    }
    given.retainAll(periodsOf(choice));
    return given;
  }

  /** Whether the linked choice is for the time's division (All, Only these, All except). */
  public static Boolean appliesTo(LinkedChoice__c choice, ElectivePeriod at) {
    Set<Id> named = new Set<Id>();
    for (Coverage__c row : choice.Coverages__r) {
      named.add(row.Division__c);
    }
    if (choice.AppliesTo__c == 'OnlyThese') {
      return named.contains(at.divisionId);
    }
    if (choice.AppliesTo__c == 'AllExcept') {
      return !named.contains(at.divisionId);
    }
    return true;
  }

  private static Set<String> periodsOf(LinkedChoice__c choice) {
    Set<String> result = new Set<String>();
    for (LinkedChoiceTime__c row : choice.Times__r) {
      result.add(periodKey(row.Weekday__c, String.valueOf(row.TimeBlock__c)));
    }
    return result;
  }

  private static String periodKey(String weekday, String blockId) {
    return weekday + '|' + Id.valueOf(blockId);
  }

  private static ShoreshException refused() {
    return new ShoreshException(
      'A seat sent as part of a linked choice doesn\'t match it. Reload the page and assign again.'
    );
  }
}
