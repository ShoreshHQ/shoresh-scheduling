/**
 * What changes in the week's special days and events from what a published schedule carried to
 * what publishing now would carry (ADR 0014 slice 5), added to a Publish preview's changes
 * (PublishedChanges) before the week's own: a day a special day replaces, no longer replaces or
 * replaces with another ("Friday: the regular day → Visiting Day"); a special day renamed, its
 * notes, its time blocks or groups changed; an event's time blocks or stations changed; and each
 * cell changed in either's own schedule, as a week's cells are said ("Bunk 1 · Friday · Visiting
 * Day · Period 2: Swim → Archery"). An event placed or taken off is a change of the week's cells,
 * said there. The camp's words are read only when a line needs them.
 */
public with sharing class SpecialChanges {
  private static final String REGULAR_DAY = 'the regular day';
  private PublishedChanges.Changes changes;
  private Id campId;
  private CampLabels labels;

  /** campId: whose words name time blocks and groups, or null for the model's words. */
  public SpecialChanges(PublishedChanges.Changes changes, Id campId) {
    this.changes = changes;
    this.campId = campId;
  }

  /** Adds what changes from was (carried when published) to now. */
  public void add(
    List<ScheduleSpecials.Special> was,
    List<ScheduleSpecials.Special> now
  ) {
    Map<String, ScheduleSpecials.Special> wasByKey = byKey(was);
    Map<String, ScheduleSpecials.Special> nowByKey = byKey(now);
    List<Date> dates = new List<Date>(ScheduleSpecials.replacedDates(was, now));
    dates.sort();
    for (Date day : dates) {
      String key = ScheduleSpecials.DAY + String.valueOf(day);
      addDay(day, wasByKey.get(key), nowByKey.get(key));
    }
    for (ScheduleSpecials.Special after : now) {
      ScheduleSpecials.Special before = wasByKey.get(after.key());
      if (after.kind == ScheduleSpecials.EVENT && before != null) {
        addPlan(after.name, before, after);
      }
    }
  }

  /** One day a special day replaces on either side. */
  private void addDay(
    Date day,
    ScheduleSpecials.Special before,
    ScheduleSpecials.Special after
  ) {
    String dayName = WeekCalendar.weekdayName(day);
    if (before == null || after == null || before.itemId != after.itemId) {
      changes.addSpecialDay(
        dayName + ': ' + nameOf(before) + ' → ' + nameOf(after)
      );
      return;
    }
    // Exactly: Apex's == ignores case, and a name's case is part of what campers read.
    if (!after.name.equals(before.name)) {
      changes.addSpecialDay(dayName + ': ' + before.name + ' → ' + after.name);
    }
    String prefix = dayName + ' · ' + after.name;
    if (!(before.notes ?? '').equals(after.notes ?? '')) {
      changes.addSpecialDay(prefix + ': notes changed');
    }
    addPlan(prefix, before, after);
  }

  /** Its time blocks, its columns, then each changed cell of one special day's or event's schedule. */
  private void addPlan(
    String prefix,
    ScheduleSpecials.Special before,
    ScheduleSpecials.Special after
  ) {
    if (!blocksText(before.grid).equals(blocksText(after.grid))) {
      note(
        after.kind,
        prefix + ': ' + words().pluralInSentence('TimeBlock') + ' changed'
      );
    }
    if (!groupsText(before.grid).equals(groupsText(after.grid))) {
      String columns = after.kind == ScheduleSpecials.EVENT
        ? 'stations'
        : words().pluralInSentence('Group');
      note(after.kind, prefix + ': ' + columns + ' changed');
    }
    new PublishedChanges.DayCompare(prefix, asDay(before), asDay(after))
      .addTo(changes);
  }

  private void note(String kind, String line) {
    if (kind == ScheduleSpecials.EVENT) {
      changes.addEvent(line);
    } else {
      changes.addSpecialDay(line);
    }
  }

  private CampLabels words() {
    if (labels == null) {
      labels = campId == null
        ? CampLabels.modelTermsOnly()
        : CampLabels.forCamp(campId);
    }
    return labels;
  }

  private static String nameOf(ScheduleSpecials.Special special) {
    return special == null ? REGULAR_DAY : special.name;
  }

  private static ScheduleDays.DayGrid asDay(ScheduleSpecials.Special special) {
    if (special.grid == null) {
      return null;
    }
    ScheduleDays.DayGrid day = new ScheduleDays.DayGrid();
    day.day = special.dateValue;
    day.grid = special.grid;
    return day;
  }

  /** Each time block's id, name and times, in order. */
  private static String blocksText(ScheduleGrid grid) {
    List<String> parts = new List<String>();
    for (
      ScheduleGrid.Block block : grid == null
        ? new List<ScheduleGrid.Block>()
        : grid.blocks
    ) {
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
    List<String> parts = new List<String>();
    for (
      ScheduleGrid.GroupRef grp : grid == null
        ? new List<ScheduleGrid.GroupRef>()
        : grid.groups
    ) {
      parts.add(grp.id + '|' + grp.name);
    }
    return String.join(parts, '\n');
  }

  private static Map<String, ScheduleSpecials.Special> byKey(
    List<ScheduleSpecials.Special> specials
  ) {
    Map<String, ScheduleSpecials.Special> result = new Map<String, ScheduleSpecials.Special>();
    for (ScheduleSpecials.Special special : specials) {
      result.put(special.key(), special);
    }
    return result;
  }
}
