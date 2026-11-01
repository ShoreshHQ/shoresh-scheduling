/**
 * put_special_day_on_day and take_special_day_off_day: a special day's "Put on a day" and "Take
 * off" (Special events screen; Take off also on Manual Build and Generated Schedule) through an
 * agent or the command line (docs/protocol/api.md API-1.74). Web addresses
 * /v1/put_special_day_on_day (here) and /v1/take_special_day_off_day (AgentTakeOffSpecialDay),
 * POST {season, special_day, week, day, replace, seen}. It is the screen's own action
 * (SpecialPlacingController.putOnDay / takeOffDay), made only while the week day still has what
 * the agent read (seen: the special day's exact name, or "none"), compared with the week locked;
 * otherwise refused (409), nothing changed. Another special day there is replaced only with
 * replace: true, the answer to the screen's own question ("Use this one instead?"), which the
 * agent asks the person first.
 */
@RestResource(urlMapping='/v1/put_special_day_on_day')
global with sharing class AgentSpecialDay implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'special_day',
    'week',
    'day',
    'replace',
    'seen'
  };
  // What a day with no special day reads as (read_special_days).
  private static final String NONE = 'none';
  private static final List<String> WEEKDAYS = new List<String>{
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  };

  public static final String PUT = 'put';
  public static final String TAKE_OFF = 'take off';

  // PUT or TAKE_OFF.
  private String action;

  public AgentSpecialDay() {
    this(PUT);
  }

  public AgentSpecialDay(String action) {
    this.action = action;
  }

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentSpecialDay());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    String seen = seenOf(body);
    Season__c season = AgentChangeCampWords.seasonOf(
      AgentFields.text(body, 'season')
    );
    CampLabels labels = CampLabels.forCamp(season.Camp__c);
    SpecialDay__c specialDay = specialDayIn(
      season,
      AgentFields.text(body, 'special_day'),
      labels
    );
    Week__c week = AgentWeeks.weekIn(season, AgentFields.text(body, 'week'));
    String day = weekdayOf(AgentFields.text(body, 'day'));
    // Locked: no one's put or take off can come between the compare and the change.
    lock(week.Id);
    String now = onDayNow(week.Id, day);
    if (!seen.equals(now)) {
      throw changedSince(SpecialDates.onDay(day, week.Name), now, labels);
    }
    SpecialDayPlacing.Request request = new SpecialDayPlacing.Request();
    request.specialDayId = specialDay.Id;
    request.weekId = week.Id;
    request.day = day;
    request.answer = body.get('replace') == true
      ? SpecialDayPlacing.REPLACE
      : null;
    SpecialDayPlacing.Placed placed = placedBy(request);
    if (placed.asks != null) {
      // The screen's question: nothing changed until the person says yes.
      return placed.asks +
        ' Nothing was changed. Ask the person; if they say yes, send it again with replace: true.';
    }
    // Already on, or not there: nothing changed, so nothing to undo.
    Boolean unchanged = action == PUT
      ? now.equals(specialDay.Name)
      : !now.equals(specialDay.Name);
    return unchanged
      ? placed.said
      : placed.said + ' ' + undoneBy(now, specialDay.Name);
  }

  /** What the day had as read; refused when left out, or replace sent to a take off. */
  private String seenOf(Map<String, Object> body) {
    if (action == TAKE_OFF && body.containsKey('replace')) {
      throw new ShoreshException(
        'Shoresh doesn\'t know the field "replace" here. The fields are: day, season, seen, special_day, week.'
      );
    }
    Object sent = body.get('seen');
    if (!(sent instanceof String) || String.isBlank((String) sent)) {
      throw new ShoreshException(
        'Nothing was changed. Say what the day has as read_special_days said it (seen: the special day\'s exact name, or "none").'
      );
    }
    return ((String) sent).trim();
  }

  /** The screen's own action, refused in its words. */
  private SpecialDayPlacing.Placed placedBy(SpecialDayPlacing.Request request) {
    try {
      return action == PUT
        ? SpecialPlacingController.putOnDay(request)
        : SpecialPlacingController.takeOffDay(request);
    } catch (Exception e) {
      throw new ShoreshException(
        'Nothing was changed. ' + ScreenErrors.words(e)
      );
    }
  }

  private static AgentWeeks.ConflictException changedSince(
    String dayText,
    String now,
    CampLabels labels
  ) {
    return new AgentWeeks.ConflictException(
      'Someone else changed ' +
        dayText +
        ' since you read it: it has ' +
        (NONE.equals(now)
          ? 'no ' + labels.singularInSentence('SpecialDay')
          : '"' + now + '"') +
        ' now. Nothing was changed. Read it again with read_special_days.'
    );
  }

  /** How to undo it, in a sentence: the other action, and what a replace took off. */
  private String undoneBy(String was, String name) {
    if (action == TAKE_OFF) {
      return 'put_special_day_on_day puts it back.';
    }
    if (NONE.equals(was)) {
      return 'take_special_day_off_day takes it off again; the day\'s own schedule was kept.';
    }
    return '"' +
      was +
      '" stays saved: put_special_day_on_day with it puts it back on that day.';
  }

  /** The season's special day of that name, or refused naming the ones there are. */
  private static SpecialDay__c specialDayIn(
    Season__c season,
    String name,
    CampLabels labels
  ) {
    if (String.isBlank(name)) {
      throw new ShoreshException(
        'Say which ' +
          labels.singularInSentence('SpecialDay') +
          ' (special_day), as read_special_days names it.'
      );
    }
    return (SpecialDay__c) AgentWeeks.named(
      [
        SELECT Id, Name
        FROM SpecialDay__c
        WHERE Season__c = :season.Id
        WITH USER_MODE
        ORDER BY SortOrder__c, Name
      ],
      name,
      labels.singularInSentence('SpecialDay')
    );
  }

  /** "Friday" from "friday"; anything else is refused. */
  private static String weekdayOf(String asked) {
    for (String weekday : WEEKDAYS) {
      if (IncomingBatch.fold(weekday) == IncomingBatch.fold(asked)) {
        return weekday;
      }
    }
    throw new ShoreshException('Say which day of the week (day), like Friday.');
  }

  private static void lock(Id weekId) {
    List<Week__c> locked = [
      SELECT Id
      FROM Week__c
      WHERE Id = :weekId
      WITH USER_MODE
      FOR UPDATE
    ];
    locked.clear();
  }

  /** The exact name of the special day on that week day now, or "none". */
  private static String onDayNow(Id weekId, String day) {
    List<SpecialDate__c> there = [
      SELECT SpecialDay__r.Name
      FROM SpecialDate__c
      WHERE Week__c = :weekId AND Day__c = :day AND SpecialDay__c != NULL
      WITH USER_MODE
      LIMIT 1
    ];
    return there.isEmpty() ? NONE : there[0].SpecialDay__r.Name;
  }
}
