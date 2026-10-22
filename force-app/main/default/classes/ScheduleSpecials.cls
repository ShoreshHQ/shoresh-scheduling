/**
 * The special days and events a schedule shows (ADR 0014 slice 5; desktop ADR
 * 2026-10-09-special-day-binds-to-a-week-day D6 and D7): each of its days a special day replaces,
 * with that special day's own schedule, and the schedule inside each special event placed on its
 * other days. Publish carries them (PublishedPlan__c), so a schedule that is or was published shows
 * them as they were published, never as they are changed later; any other schedule shows the
 * week's as they are now, as Manual Build and Generated Schedule do. A special day's schedule is
 * carried and shown with the schedule's own groups only. Runs in user mode; someone who may not
 * read the special objects gets none, and the schedule shows as it is.
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
   * The week's special days and events as they are now, for these days of a schedule of it: each
   * day a special day replaces (with only the day's groups), then each special event placed on
   * a day not replaced that has a schedule of its own, by name. Two queries at most: the week's
   * special days, then every plan.
   */
  public static List<Special> now(Id weekId, List<ScheduleDays.DayGrid> days) {
    List<Special> result = new List<Special>();
    if (!readable() || days.isEmpty()) {
      return result;
    }
    Map<Date, ScheduleDays.DayGrid> byDate = new Map<Date, ScheduleDays.DayGrid>();
    for (ScheduleDays.DayGrid day : days) {
      byDate.put(day.day, day);
    }
    Set<Id> itemIds = new Set<Id>();
    for (SpecialDate__c row : [
      SELECT
        Day__c,
        SpecialDay__c,
        SpecialDay__r.Name,
        SpecialDay__r.Notes__c,
        Week__r.StartDate__c,
        Week__r.EndDate__c
      FROM SpecialDate__c
      WHERE Week__c = :weekId AND SpecialDay__c != NULL
      WITH USER_MODE
      ORDER BY Day__c, Id
    ]) {
      Date onDate = SpecialDates.dateOf(
        row.Week__r.StartDate__c,
        row.Week__r.EndDate__c,
        row.Day__c
      );
      if (onDate == null || !byDate.containsKey(onDate)) {
        // The week no longer has that weekday, or this schedule doesn't run on it.
        continue;
      }
      Special special = new Special();
      special.kind = DAY;
      special.itemId = row.SpecialDay__c;
      special.name = row.SpecialDay__r.Name;
      special.notes = row.SpecialDay__r.Notes__c;
      special.dateValue = onDate;
      result.add(special);
      itemIds.add(row.SpecialDay__c);
    }
    sortDays(result);
    Set<Date> replaced = new Set<Date>();
    for (Special special : result) {
      replaced.add(special.dateValue);
    }
    Map<Id, String> eventNames = eventsOn(days, replaced);
    itemIds.addAll(eventNames.keySet());
    if (itemIds.isEmpty()) {
      return result;
    }
    Map<Id, SpecialPlans.Plan> plans = SpecialPlans.readAll(itemIds);
    for (Special special : result) {
      SpecialPlans.Plan plan = plans.get(Id.valueOf(special.itemId));
      special.problem = plan.problem;
      special.grid = plan.grid == null
        ? null
        : WeekSpecials.onlyGroups(
            plan.grid,
            groupIdsOf(byDate.get(special.dateValue))
          );
    }
    List<Special> events = new List<Special>();
    for (Id eventId : eventNames.keySet()) {
      SpecialPlans.Plan plan = plans.get(eventId);
      if (plan.grid == null && plan.problem == null) {
        // No schedule of its own yet: nothing to open.
        continue;
      }
      Special special = new Special();
      special.kind = EVENT;
      special.itemId = eventId;
      special.name = eventNames.get(eventId);
      special.grid = plan.grid;
      special.problem = plan.problem;
      events.add(special);
    }
    sortEvents(events);
    result.addAll(events);
    return result;
  }

  /** What a schedule that is or was published carried when it was published (one query). */
  public static List<Special> carriedBy(Id scheduleId) {
    List<Special> result = new List<Special>();
    if (!Schema.sObjectType.PublishedPlan__c.isAccessible()) {
      return result;
    }
    Map<String, List<PublishedPlan__c>> partsByKey = new Map<String, List<PublishedPlan__c>>();
    List<Special> inOrder = new List<Special>();
    for (PublishedPlan__c part : [
      SELECT
        Name,
        Kind__c,
        Item__c,
        Date__c,
        Notes__c,
        Part__c,
        Plan__c,
        GridFormatVersion__c,
        Revision__c
      FROM PublishedPlan__c
      WHERE Schedule__c = :scheduleId
      WITH USER_MODE
      ORDER BY Kind__c, Date__c, Name, Item__c, Part__c
    ]) {
      Special special = new Special();
      special.kind = part.Kind__c;
      special.itemId = part.Item__c;
      special.dateValue = part.Date__c;
      String key = special.key();
      if (!partsByKey.containsKey(key)) {
        special.name = part.Name;
        special.notes = part.Notes__c;
        partsByKey.put(key, new List<PublishedPlan__c>());
        inOrder.add(special);
      }
      partsByKey.get(key).add(part);
    }
    for (Special special : inOrder) {
      List<PublishedPlan__c> parts = partsByKey.get(special.key());
      if (String.isBlank(parts[0].Plan__c)) {
        // It had no schedule yet when it was published.
        result.add(special);
        continue;
      }
      List<ScheduleDay__c> asDays = new List<ScheduleDay__c>();
      for (PublishedPlan__c part : parts) {
        asDays.add(
          new ScheduleDay__c(
            Part__c = part.Part__c,
            Grid__c = part.Plan__c,
            GridFormatVersion__c = part.GridFormatVersion__c,
            Revision__c = part.Revision__c
          )
        );
      }
      // The same format and rules as a schedule day, so its reader is used as it is.
      ScheduleDays.DayGrid read = ScheduleDays.readDay(
        special.dateValue,
        asDays
      );
      special.grid = read.grid;
      special.problem = read.problem;
      result.add(special);
    }
    return result;
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

  /**
   * Writes what a published copy carries (one record per part of each schedule; one with no
   * plan for a special day with no schedule yet). Called by Publish only, with PublishedGuard
   * allowing it.
   */
  public static void carry(Id scheduleId, List<Special> specials) {
    List<PublishedPlan__c> rows = new List<PublishedPlan__c>();
    for (Special special : specials) {
      List<String> texts = special.grid == null
        ? new List<String>{ null }
        : ScheduleGridParts.split(special.grid);
      Integer format = special.grid == null
        ? ScheduleGrid.FORMAT_VERSION
        : ScheduleGridLocks.formatOf(special.grid);
      for (Integer i = 0; i < texts.size(); i++) {
        rows.add(
          new PublishedPlan__c(
            Schedule__c = scheduleId,
            Name = special.name == null ? null : special.name.left(80),
            Kind__c = special.kind,
            Item__c = special.itemId,
            Date__c = special.dateValue,
            Notes__c = special.notes,
            Part__c = i + 1,
            Plan__c = texts[i],
            GridFormatVersion__c = format,
            Revision__c = 1
          )
        );
      }
    }
    if (!rows.isEmpty()) {
      Database.insert(rows, AccessLevel.USER_MODE);
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

  /**
   * Adds to changes what changes in the special days and events from what the published
   * schedule carried (was) to what publishing now would carry (now): a day a special day
   * replaces, no longer replaces or replaces with another ("Friday: the regular day → Visiting
   * Day"); a special day renamed, its notes, its time blocks or groups changed; an event's time
   * blocks or stations changed; and each cell changed in either's schedule, as a week's cells
   * are said ("Bunk 1 · Friday · Visiting Day · Period 2: Swim → Archery"). An event placed or
   * taken off is a change of the week's cells, said there. campId: whose words name time blocks
   * and groups (read only if a line needs them), or null for the model's words.
   */
  public static void addChanges(
    PublishedChanges.Changes changes,
    List<Special> was,
    List<Special> now,
    Id campId
  ) {
    Words labels = new Words(campId);
    Map<String, Special> wasByKey = byKey(was);
    Map<String, Special> nowByKey = byKey(now);
    List<Date> dates = new List<Date>(replacedDates(was, now));
    dates.sort();
    for (Date day : dates) {
      Special before = wasByKey.get(DAY + String.valueOf(day));
      Special after = nowByKey.get(DAY + String.valueOf(day));
      String dayName = WeekCalendar.weekdayName(day);
      if (before == null || after == null || before.itemId != after.itemId) {
        changes.addSpecial(
          dayName +
            ': ' +
            (before == null ? 'the regular day' : before.name) +
            ' → ' +
            (after == null ? 'the regular day' : after.name),
          false
        );
        continue;
      }
      String prefix = dayName + ' · ' + after.name;
      if (!after.name.equals(before.name)) {
        changes.addSpecial(
          dayName + ': ' + before.name + ' → ' + after.name,
          false
        );
      }
      if (!(before.notes ?? '').equals(after.notes ?? '')) {
        changes.addSpecial(prefix + ': notes changed', false);
      }
      addPlanChanges(changes, prefix, before, after, labels);
    }
    for (Special after : now) {
      Special before = wasByKey.get(after.key());
      if (after.kind == EVENT && before != null) {
        addPlanChanges(changes, after.name, before, after, labels);
      }
    }
  }

  /** Its time blocks, its columns, then each changed cell of one special day's or event's schedule. */
  private static void addPlanChanges(
    PublishedChanges.Changes changes,
    String prefix,
    Special before,
    Special after,
    Words labels
  ) {
    Boolean isEvent = after.kind == EVENT;
    // Exactly: Apex's != ignores case, and a name's case is part of what campers read.
    if (!blocksText(before.grid).equals(blocksText(after.grid))) {
      changes.addSpecial(
        prefix + ': ' + labels.get().pluralInSentence('TimeBlock') + ' changed',
        isEvent
      );
    }
    if (!groupsText(before.grid).equals(groupsText(after.grid))) {
      changes.addSpecial(
        prefix +
          ': ' +
          (isEvent ? 'stations' : labels.get().pluralInSentence('Group')) +
          ' changed',
        isEvent
      );
    }
    PublishedChanges.addDay(changes, prefix, asDay(before), asDay(after));
  }

  /** The camp's words, read the first time a line needs them. */
  private class Words {
    private Id campId;
    private CampLabels labels;

    private Words(Id campId) {
      this.campId = campId;
    }

    private CampLabels get() {
      if (labels == null) {
        labels = campId == null
          ? CampLabels.modelTermsOnly()
          : CampLabels.forCamp(campId);
      }
      return labels;
    }
  }

  private static ScheduleDays.DayGrid asDay(Special special) {
    if (special.grid == null) {
      return null;
    }
    ScheduleDays.DayGrid day = new ScheduleDays.DayGrid();
    day.day = special.dateValue;
    day.grid = special.grid;
    return day;
  }

  /** Each time block's id, name and times, in order (exactly: a name's case is what is read). */
  private static String blocksText(ScheduleGrid grid) {
    if (grid == null) {
      return '';
    }
    List<String> parts = new List<String>();
    for (ScheduleGrid.Block block : grid.blocks) {
      parts.add(
        block.id +
          '|' +
          block.name +
          '|' +
          block.startTime +
          '|' +
          block.endTime
      );
    }
    return String.join(parts, '\n');
  }

  private static String groupsText(ScheduleGrid grid) {
    if (grid == null) {
      return '';
    }
    List<String> parts = new List<String>();
    for (ScheduleGrid.GroupRef grp : grid.groups) {
      parts.add(grp.id + '|' + grp.name);
    }
    return String.join(parts, '\n');
  }

  private static Map<String, Special> byKey(List<Special> specials) {
    Map<String, Special> result = new Map<String, Special>();
    for (Special special : specials) {
      result.put(special.key(), special);
    }
    return result;
  }

  /**
   * The special events placed (with their records) on the days not replaced, each with its name
   * as the schedule has it, in the order first placed.
   */
  private static Map<Id, String> eventsOn(
    List<ScheduleDays.DayGrid> days,
    Set<Date> replaced
  ) {
    Map<Id, String> result = new Map<Id, String>();
    for (ScheduleDays.DayGrid day : days) {
      if (day.grid == null || replaced.contains(day.day)) {
        continue;
      }
      Set<String> used = new Set<String>();
      for (List<String> row : day.grid.rows) {
        used.addAll(row);
      }
      for (Integer i = 0; i < day.grid.items.size(); i++) {
        ScheduleGrid.Item item = day.grid.items[i];
        Id eventId = asId(item.id);
        if (
          item.kind == EVENT &&
          eventId != null &&
          used.contains(String.valueOf(i + 1)) &&
          !result.containsKey(eventId)
        ) {
          result.put(eventId, item.name);
        }
      }
    }
    return result;
  }

  private static Set<Id> groupIdsOf(ScheduleDays.DayGrid day) {
    Set<Id> result = new Set<Id>();
    if (day == null || day.grid == null) {
      return result;
    }
    for (ScheduleGrid.GroupRef grp : day.grid.groups) {
      Id groupId = asId(grp.id);
      if (groupId != null) {
        result.add(groupId);
      }
    }
    return result;
  }

  private static Id asId(String text) {
    if (String.isBlank(text)) {
      return null;
    }
    try {
      return Id.valueOf(text);
    } catch (StringException e) {
      return null;
    }
  }

  private static Boolean readable() {
    return Schema.sObjectType.SpecialDate__c.isAccessible() &&
      Schema.sObjectType.SpecialDay__c.isAccessible() &&
      Schema.sObjectType.SpecialEvent__c.isAccessible() &&
      Schema.sObjectType.PlanPart__c.isAccessible();
  }

  private static void sortDays(List<Special> days) {
    for (Integer i = 1; i < days.size(); i++) {
      Special current = days[i];
      Integer j = i - 1;
      while (j >= 0 && days[j].dateValue > current.dateValue) {
        days[j + 1] = days[j];
        j--;
      }
      days[j + 1] = current;
    }
  }

  /** By name (capitals aside), then Id: the same events always in the same order. */
  private static void sortEvents(List<Special> events) {
    for (Integer i = 1; i < events.size(); i++) {
      Special current = events[i];
      Integer j = i - 1;
      while (j >= 0 && comesAfter(events[j], current)) {
        events[j + 1] = events[j];
        j--;
      }
      events[j + 1] = current;
    }
  }

  private static Boolean comesAfter(Special a, Special b) {
    Integer byName = (a.name ?? '')
      .toLowerCase()
      .compareTo((b.name ?? '').toLowerCase());
    return byName > 0 || (byName == 0 && a.itemId.compareTo(b.itemId) > 0);
  }
}
