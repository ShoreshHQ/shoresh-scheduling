/**
 * What the person's own actions through an agent or the command line share (docs/protocol/api.md
 * API-1.11 to API-1.14): the program's Generated Schedule week, found by the names the camp uses
 * and locked as the screen's save locks it (the request itself is AgentRequest's). A change
 * leaves exactly what the same action on the screen leaves (API-1.148): no version of its own. Runs in user mode, so the person has exactly the access
 * they have on Generated Schedule.
 */
public with sharing class AgentWeeks {
  public static final String NO_ACCESS = 'You can\'t change schedules in Shoresh. A Salesforce admin can give you the "Shoresh Scheduler" permission set.';

  /** Someone else's change got in the way: nothing was changed (answered 409). */
  public class ConflictException extends Exception {
  }

  /** Someone saved the week since the AI read it (LOCK-4.8). */
  public static ConflictException changedSince(String change) {
    return new ConflictException(
      'Changed by someone else since you read the week: ' +
        change +
        '. Nothing was changed.'
    );
  }

  /** The week asked for: its Generated draft, locked until the request ends. */
  public class Week {
    public Schedule__c draft;
    public String name;
    public Season__c season;
    public Program__c program;
    public Id weekId;
    // True when the draft is the week's Manual Build (API-1.41), not its Generated Schedule.
    public Boolean manual = false;
  }

  /**
   * The season's week (season, week, program) on Generated Schedule, locked as a save locks it.
   * The program may be left out when the season has only one.
   */
  public static Week weekOf(Map<String, Object> body) {
    Week result = placeOf(body);
    if (result.draft == null) {
      throw new ShoreshException(
        result.name + ' hasn\'t been built for ' + result.program.Name + ' yet.'
      );
    }
    result.draft = GeneratedDrafts.lockedToEdit(result.draft.Id);
    return result;
  }

  /**
   * The season's week (season, week, program) and its Generated draft as found, unlocked, or null
   * before the week is first built. Refused without the right to change schedules.
   */
  public static Week placeOf(Map<String, Object> body) {
    requireScheduler();
    Season__c season = OutgoingRows.seasonCalled(
      AgentFields.text(body, 'season')
    );
    Week__c week = weekIn(season, AgentFields.text(body, 'week'));
    Program__c program = programOf(season, AgentFields.text(body, 'program'));
    Week result = new Week();
    result.draft = GeneratedDrafts.find(program.Id, week.Id);
    result.name = week.Name;
    result.season = season;
    result.program = program;
    result.weekId = week.Id;
    return result;
  }

  /**
   * Changing a schedule on screen takes the Shoresh Scheduler permission set (or an admin's
   * access): without the right to change schedules, nothing is tried.
   */
  public static void requireScheduler() {
    if (
      !Schedule__c.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED)
        .isUpdateable()
    ) {
      throw new ShoreshException(NO_ACCESS);
    }
  }

  /** The season's week of that name, or refused with the season's weeks. */
  public static Week__c weekIn(Season__c season, String weekName) {
    return OutgoingRows.weekIn(season, weekName);
  }

  public static Program__c programOf(Season__c season, String name) {
    List<Program__c> programs = [
      SELECT Id, Name
      FROM Program__c
      WHERE Season__c = :season.Id
      WITH USER_MODE
      ORDER BY SortOrder__c, Name
    ];
    if (String.isBlank(name) && programs.size() == 1) {
      return programs[0];
    }
    if (String.isBlank(name)) {
      List<String> names = new List<String>();
      for (Program__c program : programs) {
        names.add(program.Name);
      }
      // The camp's Program words (CORE-1.0), read only when refusing.
      CampLabels words = IncomingSeason.labelsOf(season.Id);
      throw new ShoreshException(
        programs.isEmpty()
          ? season.Name +
            ' has no ' +
            words.pluralInSentence('Program') +
            ' yet.'
          : 'Say which ' +
            words.singularInSentence('Program') +
            ' (program): ' +
            String.join(names, ', ') +
            '.'
      );
    }
    return (Program__c) named(programs, name, 'Program');
  }

  /**
   * The one record of that name (as camps type names), or refused in plain words, never one
   * picked silently (API-1.25): AgentNamed.
   */
  public static SObject named(List<SObject> rows, String name, String term) {
    return AgentNamed.one(rows, name, term);
  }

  /** "The programs: Main, Teens." or "There are no programs yet." (things: the plural). */
  public static String namesSaid(String things, List<String> names) {
    return names.isEmpty()
      ? 'There are no ' + things + ' yet.'
      : 'The ' + things + ': ' + String.join(names, ', ') + '.';
  }

  /** The day of the week asked for, by its weekday ("Monday"), date ("2026-06-29") or number ("Day 3": WEEK-1.7). */
  public static ScheduleDays.DayGrid dayOf(
    List<ScheduleDays.DayGrid> days,
    String asked,
    String weekName
  ) {
    if (String.isBlank(asked)) {
      throw new ShoreshException(
        'Say which day (day), like ' + DayWords.sayWeekday('Monday') + '.'
      );
    }
    for (ScheduleDays.DayGrid day : days) {
      if (isDayAsked(day.day, asked)) {
        if (day.grid == null) {
          throw new ShoreshException(
            'This day could not be read: ' + day.problem + '.'
          );
        }
        return day;
      }
    }
    throw new ShoreshException(
      weekName + ' has no day "' + asked.left(40) + '" in its schedule.'
    );
  }

  /** Whether this is the day asked: its date, weekday or number. */
  private static Boolean isDayAsked(Date day, String asked) {
    return String.valueOf(day) == asked ||
      IncomingBatch.fold(WeekCalendar.weekdayName(day)) ==
      IncomingBatch.fold(asked) ||
      IncomingBatch.fold(DayWords.say(day)) == IncomingBatch.fold(asked);
  }
}
