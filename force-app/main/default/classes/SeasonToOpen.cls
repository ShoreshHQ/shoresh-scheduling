/**
 * The season an AI request that names none uses (docs/protocol/api.md API-1.24, API-1.108): the
 * one Shoresh's screens open on, unless that isn't one season.
 */
public with sharing class SeasonToOpen {
  /**
   * The season Shoresh's screens open on (Camp Setup: the first camp by name, then its season
   * with the latest start), or refused naming the seasons when that isn't one season: that camp
   * has none, or two of its seasons start the same day (API-1.24).
   */
  public static Season__c find() {
    List<Season__c> seen = OutgoingRows.seasonsSeen();
    Id camp = firstCamp(seen);
    List<Season__c> its = new List<Season__c>();
    for (Season__c season : seen) {
      if (season.Camp__c == camp) {
        its.add(season);
      }
    }
    if (isOne(its)) {
      return its[0];
    }
    throw new ShoreshException(
      seen.isEmpty()
        ? 'This user can\'t see any season in Shoresh.'
        : 'Say which season (season)' +
          (notEnded(its) > 1
            ? ': more than one hasn\'t ended yet, so Shoresh doesn\'t pick one. '
            : '. ') +
          OutgoingRows.seasonsSaid()
    );
  }

  /** Whether the camp's seasons, newest first, give one to open on. */
  private static Boolean isOne(List<Season__c> its) {
    return !its.isEmpty() &&
      (its.size() == 1 ||
      its[0].StartDate__c != its[1].StartDate__c) &&
      notEnded(its) <= 1;
  }

  /**
   * How many of the camp's seasons haven't ended (API-1.108): with two, a season copied for next
   * summer would otherwise become where every request that names none goes, unseen.
   */
  private static Integer notEnded(List<Season__c> seasons) {
    Integer count = 0;
    for (Season__c season : seasons) {
      if (season.EndDate__c == null || season.EndDate__c >= Date.today()) {
        count++;
      }
    }
    return count;
  }

  /** The camp the screens open on: the first by name the user can see. */
  private static Id firstCamp(List<Season__c> seen) {
    try {
      for (Camp__c camp : [
        SELECT Id
        FROM Camp__c
        WITH USER_MODE
        ORDER BY Name
        LIMIT 1
      ]) {
        return camp.Id;
      }
    } catch (QueryException e) {
      // A key may see seasons but not camps: their seasons' first camp, in the same order.
      return seen.isEmpty() ? null : seen[0].Camp__c;
    }
    return null;
  }
}
