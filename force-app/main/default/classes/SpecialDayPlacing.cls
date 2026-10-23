/**
 * "Put on a day" (ADR 0014 slice 4; desktop ADR 2026-10-09-special-day-binds-to-a-week-day and
 * Director Guide §7 "Place it on a week and day"): a special day goes on a weekday of a week and
 * replaces that day for the whole camp, on Manual Build and Generated Schedule alike. A week day
 * holds one special day, so putting one where another is asks first (desktop D11.4: "Week 2
 * Tuesday already uses Color War. Use Visiting Day instead?"); the one replaced stays saved. The
 * week's own cells for that day are kept as they are, out of sight, and come back when the day is
 * taken off (desktop D4.6: non-destructive; ADR 0014 slice 6). Runs in user mode.
 */
public with sharing class SpecialDayPlacing {
  // The director's answer to "Use this one instead?": yes, replace the special day there.
  public static final String REPLACE = 'replace';

  /** What the screen asks for. answer: REPLACE once the director said yes to the question. */
  public class Request {
    @AuraEnabled
    public Id specialDayId { get; set; }
    @AuraEnabled
    public Id weekId { get; set; }
    // The weekday ("Friday").
    @AuraEnabled
    public String day { get; set; }
    @AuraEnabled
    public String answer { get; set; }
  }

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

  /** Where putOnFreeDays put a special day, and the days another one kept ("Wednesday already has "Field Day""). */
  public class Spread {
    public List<String> put = new List<String>();
    public List<String> kept = new List<String>();
  }

  /**
   * Puts a special day on each of the week's weekdays that has no other special day; a day that
   * has one keeps it (Set it up asks nothing: it says so). Already on a day counts as put.
   */
  public static Spread putOnFreeDays(
    SpecialDay__c specialDay,
    Id weekId,
    List<String> weekdays
  ) {
    Map<String, String> taken = WeekSpecials.replacedNames(weekId);
    Spread spread = new Spread();
    for (String weekday : weekdays) {
      String there = taken.get(weekday);
      if (there == null) {
        SpecialDates.place(specialDay.Id, weekId, weekday);
      }
      if (there == null || there == specialDay.Name) {
        spread.put.add(weekday);
      } else {
        spread.kept.add(weekday + ' already has "' + there + '"');
      }
    }
    return spread;
  }

  /** Puts the special day on the week's weekday; asks first before replacing another. */
  public static Placed putOn(Request request) {
    if (request?.specialDayId?.getSObjectType() != SpecialDay__c.SObjectType) {
      throw new ShoreshException('That can\'t be put on a day.');
    }
    Week__c week = weekOf(request.weekId);
    String dayText = SpecialDates.onDay(request.day, week.Name);
    List<SpecialDate__c> there = [
      SELECT Id, SpecialDay__c, SpecialDay__r.Name
      FROM SpecialDate__c
      WHERE
        Week__c = :request.weekId
        AND Day__c = :request.day
        AND SpecialDay__c != NULL
      WITH USER_MODE
      FOR UPDATE
    ];
    Placed result = new Placed();
    if (!there.isEmpty() && there[0].SpecialDay__c == request.specialDayId) {
      result.said =
        '"' +
        there[0].SpecialDay__r.Name +
        '" is already on ' +
        dayText +
        '.';
    } else if (!there.isEmpty() && request.answer != REPLACE) {
      result = question(
        dayText,
        there[0].SpecialDay__r.Name,
        CampLabels.forCamp(week.Season__r.Camp__c)
      );
    } else {
      put(request, there);
      result.said = nameOf(request.specialDayId) + ' is on ' + dayText + '.';
    }
    return result;
  }

  /**
   * Takes the special day off the week's weekday (desktop "Remove from this day"; Director Guide
   * "Take it off a day"): that day has its regular schedule again, the week's own cells for it
   * just as they were kept (desktop D4.6), and the special day stays saved, so putting it back on
   * gives the same day again. One already off says so and changes nothing.
   */
  public static Placed takeOff(Request request) {
    if (request?.specialDayId?.getSObjectType() != SpecialDay__c.SObjectType) {
      throw new ShoreshException('That can\'t be taken off a day.');
    }
    Week__c week = weekOf(request.weekId);
    String dayText = SpecialDates.onDay(request.day, week.Name);
    List<SpecialDate__c> there = [
      SELECT Id, SpecialDay__r.Name
      FROM SpecialDate__c
      WHERE
        Week__c = :request.weekId
        AND Day__c = :request.day
        AND SpecialDay__c = :request.specialDayId
      WITH USER_MODE
      FOR UPDATE
    ];
    Placed result = new Placed();
    if (there.isEmpty()) {
      result.said =
        nameOf(request.specialDayId) +
        ' is not on ' +
        dayText +
        '.';
      return result;
    }
    SpecialDates.takeOff(there[0].Id);
    result.said =
      dayText +
      ' has its regular schedule again. "' +
      there[0].SpecialDay__r.Name +
      '" stays saved.';
    return result;
  }

  /**
   * 'Friday of "Week 3" already has the special day "Color War". Use this one instead? "Color
   * War" stays saved.'
   */
  private static Placed question(
    String dayText,
    String other,
    CampLabels labels
  ) {
    Placed result = new Placed();
    result.replaces = other;
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

  /** The one there (if any) taken off and this one put on, all or none. */
  private static void put(Request request, List<SpecialDate__c> there) {
    Savepoint beforePut = Database.setSavepoint();
    try {
      if (!there.isEmpty()) {
        SpecialDates.takeOff(there[0].Id);
      }
      SpecialDates.place(request.specialDayId, request.weekId, request.day);
    } catch (Exception e) {
      Database.rollback(beforePut);
      throw e;
    }
  }

  private static Week__c weekOf(Id weekId) {
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
    return weeks[0];
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
