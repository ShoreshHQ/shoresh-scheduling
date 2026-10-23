/**
 * "Set it up" on a cell an import noted as "not set up yet" (ADR 0005 §2, ADR 0006; ADR 0014
 * slice 4; ADR 0018 slice E5): one click makes the special event, special day or elective set the
 * file named, from what the file had: its name and where it was.
 * - A special event: the season's event of that name (made when there is none), and every cell
 *   of the week's draft that named it now holds that event, where it was.
 * - An elective set (plan §6.1, "bound by name"): the season's set of that name, spaces and
 *   capitals aside (made with no offerings yet when there is none, named as the file had it:
 *   desktop "created set name = the header text verbatim"), and every cell of the draft that
 *   named it now holds that set, where it was.
 * - A special day: the season's special day of that name (made when there is none, starting from
 *   the camp's regular day as one added on the Special events screen does: SpecialDaySeed), put on
 *   each weekday of the week where the file had it. A day that already has another special day
 *   keeps it, and is named in the answer. The draft's cells are kept as they are, out of sight
 *   while the special day is on the day.
 * Works on Manual Build's draft and on Generated Schedule's alike. Runs in user mode, under the
 * draft's lock.
 */
public with sharing class SpecialSetUp {
  // What can be set up from a noted cell: a special event, a special day, an elective set.
  private static final Set<String> KINDS = new Set<String>{ 'S', 'D', 'E' };

  // The draft, its days as read, and the camp's words.
  private Schedule__c draft;
  private List<ScheduleDays.DayGrid> days;
  private CampLabels labels;

  public class Done {
    // What was done, in a sentence or two.
    @AuraEnabled
    public String said;
  }

  /**
   * Sets up what a not-set-up cell names. kind: 'S' (special event), 'D' (special day) or 'E'
   * (elective set, ADR 0018 slice E5).
   */
  public static Done setUp(Id scheduleId, String kind, String name) {
    String trimmed = name == null ? '' : name.trim();
    if (String.isBlank(trimmed) || !KINDS.contains(kind)) {
      throw new ShoreshException('That can\'t be set up here.');
    }
    SpecialSetUp setUp = new SpecialSetUp(lockedDraft(scheduleId));
    Savepoint beforeSetUp = Database.setSavepoint();
    try {
      if (kind == 'D') {
        return setUp.specialDay(new NotedItems('D', trimmed), trimmed);
      }
      Id seasonId = setUp.draft.Program__r.Season__c;
      return kind == 'S'
        ? setUp.bind(
            new NotedItems('S', trimmed),
            SpecialNamed.event(seasonId, trimmed),
            'SpecialEvent'
          )
        : setUp.bind(
            new NotedItems('E', trimmed),
            SpecialNamed.electiveSet(seasonId, trimmed),
            'ElectiveSet'
          );
    } catch (Exception e) {
      Database.rollback(beforeSetUp);
      throw e;
    }
  }

  private SpecialSetUp(Schedule__c draft) {
    this.draft = draft;
    labels = CampLabels.forCamp(draft.Program__r.Season__r.Camp__c);
    days = ScheduleDays.read(draft.Id);
  }

  /** The draft, Manual Build's or Generated Schedule's, locked as its own screen locks it. */
  private static Schedule__c lockedDraft(Id scheduleId) {
    List<Schedule__c> found = [
      SELECT Origin__c
      FROM Schedule__c
      WHERE Id = :scheduleId
      WITH USER_MODE
    ];
    return !found.isEmpty() && found[0].Origin__c == GeneratedDrafts.GENERATED
      ? GeneratedDrafts.lockedToEdit(scheduleId)
      : ManualDrafts.locked(scheduleId);
  }

  /**
   * Every cell of the draft the file noted with that name now holds the record, where it was: a
   * special event, or an elective set (term: the camp's word for what it is).
   */
  private Done bind(NotedItems noted, SObject record, String term) {
    List<ScheduleDaySaves.DaySave> saves = new List<ScheduleDaySaves.DaySave>();
    for (ScheduleDays.DayGrid day : days) {
      if (day.grid != null && noted.pointAt(day.grid, record)) {
        saves.add(
          new ScheduleDaySaves.DaySave(day.day, day.grid, day.revision)
        );
      }
    }
    if (!saves.isEmpty()) {
      ScheduleDaySaves.write(draft.Id, saves);
    }
    return saying(
      '"' +
        (String) record.get('Name') +
        '" is set up as ' +
        article(term) +
        '.'
    );
  }

  private Done specialDay(NotedItems noted, String name) {
    SpecialDay__c specialDay = SpecialNamed.specialDay(
      draft.Program__r.Season__c,
      name
    );
    SpecialDayPlacing.Spread spread = SpecialDayPlacing.putOnFreeDays(
      specialDay,
      draft.Week__c,
      weekdaysNoting(noted)
    );
    List<String> put = spread.put;
    List<String> kept = spread.kept;
    return saying(
      '"' +
        specialDay.Name +
        '" is set up as ' +
        article('SpecialDay') +
        (put.isEmpty() ? '' : ', on ' + listed(put)) +
        '.' +
        keptText(kept)
    );
  }

  /** The weekdays the draft has the noted item on, in date order. */
  private List<String> weekdaysNoting(NotedItems noted) {
    List<String> weekdays = new List<String>();
    for (ScheduleDays.DayGrid day : days) {
      String weekday = WeekCalendar.weekdayName(day.day);
      if (
        day.grid != null &&
        noted.isIn(day.grid) &&
        !weekdays.contains(weekday)
      ) {
        weekdays.add(weekday);
      }
    }
    return weekdays;
  }

  /** ' Wednesday already has "Field Day", so it isn't on that day.' */
  private static String keptText(List<String> kept) {
    return kept.isEmpty()
      ? ''
      : ' ' +
        listed(kept) +
        ', so it isn\'t on ' +
        (kept.size() == 1 ? 'that day' : 'those days') +
        '.';
  }

  private static Done saying(String said) {
    Done result = new Done();
    result.said = said;
    return result;
  }

  /** "a special day", "an event": the camp's word with its article. */
  private String article(String term) {
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
}
