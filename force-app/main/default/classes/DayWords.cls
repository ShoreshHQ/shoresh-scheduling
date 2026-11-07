/**
 * Says a day as its season does (WEEK-1.5 to WEEK-1.7, ADR 0025 choice 3): "Monday", or "Day 3" in
 * a numbered-days season, the date's place from the camp's first day of the week, restarting every
 * week. Nothing is stored per date, so a closed date's neighbours keep their numbers, and stored
 * keys stay weekdays: this is only for what a person reads. c/shoreshDayNames does the same for
 * the screens.
 *
 * One request is about one season, so that season is held here rather than passed to every line
 * that says a day: reading a schedule's days names it (ScheduleDays.read), and a request with no
 * schedule says use(seasonId). It is looked up only when a day is first said: a named season costs
 * one query at most (none when the caller says use(seasonId, numbered)), and only a numbered one
 * reads its programs.
 */
public with sharing class DayWords {
  private static final Date A_MONDAY = Date.newInstance(1900, 1, 1);
  private static Id seasonInUse;
  private static Id scheduleRead;
  // A season's first day (0 = Monday ... 6 = Sunday), or null when its days are named.
  private static final Map<Id, Integer> FIRST_DAYS = new Map<Id, Integer>();

  public static void use(Id seasonId) {
    seasonInUse = seasonId;
    scheduleRead = null;
  }

  /** The same when the caller has read the flag: a named season then costs no query. */
  public static void use(Id seasonId, Boolean numbered) {
    use(seasonId);
    if (numbered != true) {
      FIRST_DAYS.put(seasonId, null);
    }
  }

  /** The season is this schedule's, unless the request has already named one. */
  public static void useSeasonOf(Id scheduleId) {
    if (seasonInUse == null) {
      scheduleRead = scheduleId;
    }
  }

  /** "Day 3" in a numbered season, else "Wednesday". */
  public static String say(Date day) {
    Integer firstDay = firstDayInUse();
    return firstDay == null
      ? WeekCalendar.weekdayName(day)
      : dayNumbered(WeekCalendar.weekdayIndex(day), firstDay);
  }

  /** The same for a stored weekday ("Wednesday"); anything else as it is. */
  public static String sayWeekday(String weekday) {
    Integer index = WeekCalendar.indexOfWeekday(weekday);
    Integer firstDay = index < 0 ? null : firstDayInUse();
    return firstDay == null ? weekday : dayNumbered(index, firstDay);
  }

  /** The stored weekday for what was said: "Day 3" in a numbered season; anything else as it is. */
  public static String weekdayFrom(String said) {
    for (Integer i = 0; i < 7; i++) {
      String weekday = WeekCalendar.weekdayName(A_MONDAY.addDays(i));
      if (IncomingBatch.fold(sayWeekday(weekday)) == IncomingBatch.fold(said)) {
        return weekday;
      }
    }
    return said;
  }

  /** What a screen's module is told, c/shoreshDayNames setDayNaming: firstDay 1 Monday ... 7 Sunday. */
  public static Map<String, Object> namingOf(Id seasonId) {
    use(seasonId);
    Integer firstDay = firstDayInUse();
    return new Map<String, Object>{
      'numbered' => firstDay != null,
      'firstDay' => firstDay == null ? null : firstDay + 1
    };
  }

  @TestVisible
  private static String dayNumbered(Integer weekdayIndex, Integer firstDay) {
    return 'Day ' + (Math.mod(weekdayIndex - firstDay + 7, 7) + 1);
  }

  @TestVisible
  private static void forgetSeasons() {
    FIRST_DAYS.clear();
    seasonInUse = null;
    scheduleRead = null;
  }

  private static Integer firstDayInUse() {
    if (!Schema.sObjectType.Season__c.fields.NumberedDays__c.isAccessible()) {
      return null;
    }
    if (scheduleRead != null) {
      for (Schedule__c schedule : [
        SELECT Program__r.Season__c, Program__r.Season__r.NumberedDays__c
        FROM Schedule__c
        WHERE Id = :scheduleRead
        WITH USER_MODE
      ]) {
        use(
          schedule.Program__r.Season__c,
          schedule.Program__r.Season__r.NumberedDays__c
        );
      }
      scheduleRead = null;
    }
    if (seasonInUse == null) {
      return null;
    }
    if (!FIRST_DAYS.containsKey(seasonInUse)) {
      FIRST_DAYS.put(seasonInUse, readFirstDay(seasonInUse));
    }
    return FIRST_DAYS.get(seasonInUse);
  }

  /** As c/shoreshImportEngine campFirstDay: the programs' days, or the first date's if every day. */
  private static Integer readFirstDay(Id seasonId) {
    List<Season__c> seasons = [
      SELECT NumberedDays__c, StartDate__c
      FROM Season__c
      WHERE Id = :seasonId
      WITH USER_MODE
    ];
    if (seasons.isEmpty() || !seasons[0].NumberedDays__c) {
      return null;
    }
    return WeekCalendar.firstDayOf(
      SeasonWeeks.programDays(
        [
          SELECT
            Monday__c,
            Tuesday__c,
            Wednesday__c,
            Thursday__c,
            Friday__c,
            Saturday__c,
            Sunday__c
          FROM Program__c
          WHERE Season__c = :seasonId
          WITH USER_MODE
        ]
      ),
      seasons[0].StartDate__c == null
        ? 0
        : WeekCalendar.weekdayIndex(seasons[0].StartDate__c)
    );
  }
}
