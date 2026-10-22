/**
 * "Put on a day" (ADR 0014 slice 4; desktop ADR 2026-10-09-special-day-binds-to-a-week-day and
 * Director Guide §7 "Place it on a week and day"): a special day goes on a weekday of a week and
 * replaces that day for the whole camp, on Manual Build and Generated Schedule alike. A week day
 * holds one special day, so putting one where another is asks first (desktop D11.4: "Week 2
 * Tuesday already uses Color War. Use Visiting Day instead?"); the one replaced stays saved. The
 * week's own cells for that day are kept as they are, out of sight, and come back when the day is
 * taken off (desktop D4.6: non-destructive). Runs in user mode.
 */
public with sharing class SpecialDayPlacing {
  public class Placed {
    // A question to answer first: another special day is on that day. Nothing was changed.
    @AuraEnabled
    public String asks;
    // The one it would replace ("Color War"), for the answer's button.
    @AuraEnabled
    public String replaces;
    // What was done, in a sentence, when it was.
    @AuraEnabled
    public String said;
  }

  /**
   * Puts the special day on the week's weekday ("Friday"). replace: the director said yes to
   * replacing the special day already there; without it, that is asked first.
   */
  public static Placed putOn(
    Id specialDayId,
    Id weekId,
    String day,
    Boolean replace
  ) {
    if (specialDayId?.getSObjectType() != SpecialDay__c.SObjectType) {
      throw new ShoreshException('That can\'t be put on a day.');
    }
    List<Week__c> weeks = [
      SELECT Id, Name, Season__r.Camp__c
      FROM Week__c
      WHERE Id = :weekId
      WITH USER_MODE
    ];
    if (weeks.isEmpty()) {
      throw new ShoreshException(
        'That was not found, or you don\'t have access to it. Reload the page.'
      );
    }
    Week__c week = weeks[0];
    CampLabels labels = CampLabels.forCamp(week.Season__r.Camp__c);
    Placed result = new Placed();
    String dayText = SpecialDates.onDay(day, week.Name);
    List<SpecialDate__c> there = [
      SELECT Id, SpecialDay__c, SpecialDay__r.Name
      FROM SpecialDate__c
      WHERE Week__c = :weekId AND Day__c = :day AND SpecialDay__c != NULL
      WITH USER_MODE
      FOR UPDATE
    ];
    if (!there.isEmpty() && there[0].SpecialDay__c == specialDayId) {
      result.said =
        '"' +
        there[0].SpecialDay__r.Name +
        '" is already on ' +
        dayText +
        '.';
      return result;
    }
    if (!there.isEmpty() && replace != true) {
      String other = there[0].SpecialDay__r.Name;
      result.replaces = other;
      // 'Friday of "Week 3" already has the special day "Color War". Use this one instead?
      // "Color War" stays saved.'
      result.asks =
        dayText +
        ' already has the ' +
        labels.singularInSentence('SpecialDay') +
        ' "' +
        other +
        '". Use this one instead? "' +
        other +
        '" stays saved.';
      return result;
    }
    Savepoint beforePut = Database.setSavepoint();
    try {
      if (!there.isEmpty()) {
        SpecialDates.takeOff(there[0].Id);
      }
      SpecialDates.place(specialDayId, weekId, day);
    } catch (Exception e) {
      Database.rollback(beforePut);
      throw e;
    }
    result.said = nameOf(specialDayId) + ' is on ' + dayText + '.';
    return result;
  }

  private static String nameOf(Id specialDayId) {
    List<SpecialDay__c> found = [
      SELECT Name
      FROM SpecialDay__c
      WHERE Id = :specialDayId
      WITH USER_MODE
    ];
    return found.isEmpty() ? 'It' : '"' + found[0].Name + '"';
  }
}
