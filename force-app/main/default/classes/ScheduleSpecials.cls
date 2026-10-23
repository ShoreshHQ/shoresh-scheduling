/**
 * The special days and events a schedule shows (ADR 0014 slice 5; desktop ADR
 * 2026-10-09-special-day-binds-to-a-week-day D6 and D7): each of its days a special day replaces,
 * with that special day's own schedule, and the schedule inside each special event placed on its
 * other days. Publish carries them (PublishedPlan__c), so a schedule that is or was published shows
 * them as they were published, never as they are changed later; any other schedule shows the
 * week's as they are now, as Manual Build and Generated Schedule do. A special day's schedule is
 * carried and shown with the schedule's own groups only. Runs in user mode; someone who may not
 * read the special objects gets none, and the schedule shows as it is.
 *
 * The parts: SpecialsNow (the week's now), SpecialsCarried (what a published copy carries, and
 * writing it), SpecialChanges (what changes between the two, for Publish).
 */
public with sharing class ScheduleSpecials {
  public static final String DAY = 'D';
  public static final String EVENT = 'S';
  private static final String PUBLISHED = 'Published';

  /** A special day on one day of the schedule, or a special event's own schedule. */
  public class Special {
    public String kind;
    public String itemId;
    public String name;
    // A special day's notes.
    public String notes;
    // The day a special day replaces; null for an event.
    public Date dateValue;
    // Its schedule, or null when it has none yet or it can't be read (problem).
    public ScheduleGrid grid;
    public String problem;

    public String key() {
      return kind == DAY ? DAY + String.valueOf(dateValue) : EVENT + itemId;
    }
  }

  /** As the Schedules page shows them (ScheduleViews.ScheduleView.specials). */
  public class Shown {
    // The days a special day replaces, in date order, each with its own schedule.
    @AuraEnabled
    public List<WeekSpecials.ReplacedDay> days = new List<WeekSpecials.ReplacedDay>();
    // The special events placed on the schedule, by name, each with its own schedule.
    @AuraEnabled
    public List<EventPlan> events = new List<EventPlan>();
    // What the schedule carried when it was published (true), or the week's as they are now.
    @AuraEnabled
    public Boolean asPublished = false;
  }

  /** A special event's own schedule (its time blocks down, its stations across), read-only. */
  public class EventPlan {
    @AuraEnabled
    public String eventId;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public ScheduleViews.DayView plan;
  }

  /** Is, or was, a week's published schedule (it then shows what it carried). */
  public static Boolean isPublished(Schedule__c schedule) {
    return schedule.Status__c == PUBLISHED || schedule.PublishedAt__c != null;
  }

  /** What the Schedules page shows of a schedule's special days and events. */
  public static Shown shown(
    Schedule__c schedule,
    List<ScheduleDays.DayGrid> days
  ) {
    Shown result = new Shown();
    result.asPublished = isPublished(schedule);
    List<Special> specials = result.asPublished
      ? carriedBy(schedule.Id)
      : now(schedule.Week__c, days);
    if (specials.isEmpty()) {
      return result;
    }
    List<ScheduleDays.DayGrid> plans = new List<ScheduleDays.DayGrid>();
    List<Boolean> isEvent = new List<Boolean>();
    for (Special special : specials) {
      ScheduleDays.DayGrid plan = new ScheduleDays.DayGrid();
      plan.day = special.dateValue;
      plan.grid = special.grid;
      plan.problem = special.problem;
      plans.add(plan);
      isEvent.add(special.kind == EVENT);
    }
    List<ScheduleViews.DayView> views = SpecialPlanDay.ofAll(plans, isEvent);
    for (Integer i = 0; i < specials.size(); i++) {
      Special special = specials[i];
      if (special.kind == DAY) {
        WeekSpecials.ReplacedDay replaced = new WeekSpecials.ReplacedDay();
        replaced.dateValue = special.dateValue;
        replaced.day = WeekCalendar.weekdayName(special.dateValue);
        replaced.specialDayId = special.itemId;
        replaced.name = special.name;
        replaced.notes = special.notes;
        replaced.plan = views[i];
        result.days.add(replaced);
      } else {
        EventPlan event = new EventPlan();
        event.eventId = special.itemId;
        event.name = special.name;
        event.plan = views[i];
        result.events.add(event);
      }
    }
    return result;
  }

  /**
   * The week's special days and events as they are now, for these days of a schedule of it
   * (SpecialsNow): each day a special day replaces, then each special event placed on a day not
   * replaced that has a schedule of its own, by name.
   */
  public static List<Special> now(Id weekId, List<ScheduleDays.DayGrid> days) {
    return SpecialsNow.of(weekId, days);
  }

  /**
   * The same for a draft the caller made (new Schedule__c(...), never one read by SOQL): its
   * Week__c, or its Week__r when that was set to the week read with its special days
   * (ProgramReads.weekWithSpecialDays; Manual Build), so they aren't read again.
   */
  public static List<Special> nowFor(
    Schedule__c draft,
    List<ScheduleDays.DayGrid> days
  ) {
    return draft.Week__r == null
      ? now(draft.Week__c, days)
      : SpecialsNow.ofWeek(draft.Week__r, days);
  }

  /** What a schedule that is or was published carried when it was published (SpecialsCarried). */
  public static List<Special> carriedBy(Id scheduleId) {
    return SpecialsCarried.read(scheduleId);
  }

  /** Writes what a published copy carries; Publish only (SpecialsCarried). */
  public static void carry(Id scheduleId, List<Special> specials) {
    SpecialsCarried.write(scheduleId, specials);
  }

  /** Refuses to publish a special day's or event's schedule that can't be read. */
  public static void refuseUnreadable(List<Special> specials) {
    for (Special special : specials) {
      if (special.problem != null) {
        throw new ShoreshException(
          'The schedule of "' +
            special.name +
            '" could not be read (' +
            special.problem +
            '), so nothing was published.'
        );
      }
    }
  }

  /** The days a special day replaces on either side: their own cells are out of sight. */
  public static Set<Date> replacedDates(List<Special> was, List<Special> now) {
    Set<Date> result = new Set<Date>();
    for (List<Special> side : new List<List<Special>>{ was, now }) {
      for (Special special : side) {
        if (special.kind == DAY) {
          result.add(special.dateValue);
        }
      }
    }
    return result;
  }

  /** Days in date order, then events by name (capitals aside), then Id: always the same order. */
  public static void sort(List<Special> specials) {
    for (Integer i = 1; i < specials.size(); i++) {
      Special current = specials[i];
      Integer j = i - 1;
      while (j >= 0 && sortKey(specials[j]).compareTo(sortKey(current)) > 0) {
        specials[j + 1] = specials[j];
        j--;
      }
      specials[j + 1] = current;
    }
  }

  private static String sortKey(Special special) {
    String order = special.kind == DAY
      ? String.valueOf(special.dateValue)
      : (special.name ?? '').toLowerCase();
    return special.kind + order + '\n' + special.itemId;
  }
}
