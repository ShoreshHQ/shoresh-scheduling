/**
 * "Set it up" on a cell an import noted as "not set up yet" (ADR 0005 §2, ADR 0006; ADR 0014
 * slice 4): one click makes the special event or special day the file named, from what the file
 * had: its name and where it was.
 * - A special event: the season's event of that name (made when there is none), and every cell
 *   of the week's draft that named it now holds that event, where it was.
 * - A special day: the season's special day of that name (made when there is none, starting from
 *   the camp's regular day as one added on the Special events screen does: SpecialDaySeed), put on
 *   each weekday of the week where the file had it. A day that already has another special day
 *   keeps it, and is named in the answer. The draft's cells are kept as they are, out of sight
 *   while the special day is on the day.
 * Runs in user mode, under the draft's lock.
 */
public with sharing class SpecialSetUp {
  public class Done {
    // What was done, in a sentence or two.
    @AuraEnabled
    public String said;
  }

  /**
   * Sets up what a not-set-up cell names. kind: 'S' (special event) or 'D' (special day); name:
   * the name the cell has. generated: the draft is Generated Schedule's (else Manual Build's).
   */
  public static Done setUp(
    Id scheduleId,
    Boolean generated,
    String kind,
    String name
  ) {
    Schedule__c draft = generated == true
      ? GeneratedDrafts.lockedToEdit(scheduleId)
      : ManualDrafts.locked(scheduleId);
    String trimmed = name == null ? '' : name.trim();
    if (String.isBlank(trimmed) || (kind != 'S' && kind != 'D')) {
      throw new ShoreshException('That can\'t be set up here.');
    }
    CampLabels labels = CampLabels.forCamp(draft.Program__r.Season__r.Camp__c);
    List<ScheduleDays.DayGrid> days = ScheduleDays.read(draft.Id);
    Savepoint beforeSetUp = Database.setSavepoint();
    try {
      return kind == 'S'
        ? setUpEvent(draft, days, trimmed, labels)
        : setUpDay(draft, days, trimmed, labels);
    } catch (Exception e) {
      Database.rollback(beforeSetUp);
      throw e;
    }
  }

  private static Done setUpEvent(
    Schedule__c draft,
    List<ScheduleDays.DayGrid> days,
    String name,
    CampLabels labels
  ) {
    SpecialEvent__c event = eventNamed(draft.Program__r.Season__c, name);
    List<ScheduleDaySaves.DaySave> saves = new List<ScheduleDaySaves.DaySave>();
    for (ScheduleDays.DayGrid day : days) {
      if (day.grid != null && pointAt(day.grid, 'S', name, event)) {
        saves.add(
          new ScheduleDaySaves.DaySave(day.day, day.grid, day.revision)
        );
      }
    }
    if (!saves.isEmpty()) {
      ScheduleDaySaves.write(draft.Id, saves);
    }
    Done done = new Done();
    done.said =
      '"' +
      event.Name +
      '" is set up as ' +
      article(labels, 'SpecialEvent') +
      '.';
    return done;
  }

  private static Done setUpDay(
    Schedule__c draft,
    List<ScheduleDays.DayGrid> days,
    String name,
    CampLabels labels
  ) {
    SpecialDay__c specialDay = specialDayNamed(
      draft.Program__r.Season__c,
      name
    );
    // The weekdays the file had it on, in date order.
    List<String> weekdays = new List<String>();
    for (ScheduleDays.DayGrid day : days) {
      String weekday = WeekCalendar.weekdayName(day.day);
      if (
        day.grid != null &&
        names(day.grid, 'D', name) &&
        !weekdays.contains(weekday)
      ) {
        weekdays.add(weekday);
      }
    }
    Map<String, String> taken = WeekSpecials.replacedNames(draft.Week__c);
    List<String> put = new List<String>();
    List<String> kept = new List<String>();
    for (String weekday : weekdays) {
      String there = taken.get(weekday);
      if (there == null) {
        SpecialDates.place(specialDay.Id, draft.Week__c, weekday);
        put.add(weekday);
      } else if (there != specialDay.Name) {
        kept.add(weekday + ' already has "' + there + '"');
      } else {
        put.add(weekday);
      }
    }
    Done done = new Done();
    done.said =
      '"' +
      specialDay.Name +
      '" is set up as ' +
      article(labels, 'SpecialDay') +
      (put.isEmpty() ? '' : ', on ' + listed(put)) +
      '.' +
      (kept.isEmpty()
        ? ''
        : ' ' +
          listed(kept) +
          ', so it isn\'t on ' +
          (kept.size() == 1 ? 'that day' : 'those days') +
          '.');
    return done;
  }

  /** "a special day", "an event": the camp's word with its article. */
  private static String article(CampLabels labels, String term) {
    String word = labels.singularInSentence(term);
    return ('aeiou'.contains(word.left(1).toLowerCase()) ? 'an ' : 'a ') + word;
  }

  private static String listed(List<String> parts) {
    if (parts.size() <= 1) {
      return String.join(parts, '');
    }
    List<String> first = parts.clone();
    String last = first.remove(first.size() - 1);
    return String.join(first, ', ') + ' and ' + last;
  }

  /** Whether the grid has a not-set-up item of this kind and name (spaces and capitals aside). */
  private static Boolean names(ScheduleGrid grid, String kind, String name) {
    for (ScheduleGrid.Item item : grid.items) {
      if (isNoted(item, kind, name)) {
        return true;
      }
    }
    return false;
  }

  private static Boolean isNoted(
    ScheduleGrid.Item item,
    String kind,
    String name
  ) {
    return item.kind == kind &&
      String.isBlank(item.id) &&
      loose(item.name) == loose(name);
  }

  /**
   * Each item noted by that name now points at the record, under its name; when the day already
   * held the record too, its cells use the one item. Returns whether anything changed.
   */
  private static Boolean pointAt(
    ScheduleGrid grid,
    String kind,
    String name,
    SObject record
  ) {
    Boolean changed = false;
    for (ScheduleGrid.Item item : grid.items) {
      if (isNoted(item, kind, name)) {
        item.id = record.Id;
        item.name = (String) record.get('Name');
        changed = true;
      }
    }
    if (changed) {
      oneItemEach(grid);
    }
    return changed;
  }

  /** Cells of the same thing use its first item; items no cell uses go. */
  private static void oneItemEach(ScheduleGrid grid) {
    Map<String, String> firstOf = new Map<String, String>();
    Map<String, String> renumber = new Map<String, String>();
    for (Integer i = 0; i < grid.items.size(); i++) {
      String identity = SlotIds.of(grid.items[i]);
      String position = String.valueOf(i + 1);
      if (firstOf.containsKey(identity)) {
        renumber.put(position, firstOf.get(identity));
      } else {
        firstOf.put(identity, position);
      }
    }
    for (List<String> row : grid.rows) {
      for (Integer b = 0; b < row.size(); b++) {
        if (renumber.containsKey(row[b])) {
          row[b] = renumber.get(row[b]);
        }
      }
    }
    grid.dropUnusedItems();
  }

  private static SpecialEvent__c eventNamed(Id seasonId, String name) {
    for (SpecialEvent__c event : [
      SELECT Id, Name
      FROM SpecialEvent__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      if (loose(event.Name) == loose(name)) {
        return event;
      }
    }
    SpecialEvent__c event = new SpecialEvent__c(
      Name = name,
      Season__c = seasonId
    );
    Database.insert(event, AccessLevel.USER_MODE);
    return event;
  }

  private static SpecialDay__c specialDayNamed(Id seasonId, String name) {
    for (SpecialDay__c specialDay : [
      SELECT Id, Name
      FROM SpecialDay__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      if (loose(specialDay.Name) == loose(name)) {
        return specialDay;
      }
    }
    SpecialDay__c specialDay = new SpecialDay__c(
      Name = name,
      Season__c = seasonId
    );
    Database.insert(specialDay, AccessLevel.USER_MODE);
    // It starts from the camp's regular day, as one added on the Special events screen does.
    SpecialDaySeed.seed(specialDay.Id);
    return specialDay;
  }

  /** Names compared the way people mean them: spaces and capitals aside. */
  private static String loose(String text) {
    return text == null ? '' : text.deleteWhitespace().toLowerCase();
  }
}
