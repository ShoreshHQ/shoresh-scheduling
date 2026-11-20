/**
 * move_elective_seat: one camper's seat moved to another elective at the same time, as dragging a
 * name or the roster's Move to on the Elective seats screen does, through an agent or the command
 * line (docs/protocol/api.md API-1.68). Web address /v1/move_elective_seat, POST {season, week,
 * elective_set, camper, day, time, elective, seen}. It is the screen's own change of one seat
 * (ElectiveSeatsController.changeSeat): moved by hand and locked, so Assign again keeps it; done
 * only while the run is still as the agent read it (seen), with the run locked; otherwise refused
 * (409), nothing changed.
 */
@RestResource(urlMapping='/v1/move_elective_seat')
global with sharing class AgentMoveElectiveSeat implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'elective_set',
    'camper',
    'day',
    'time',
    'elective',
    'seen'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentMoveElectiveSeat());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentElectives.Run run = AgentElectives.committed(body);
    Decimal seen = AgentElectives.seenOf(body, run);
    AgentElectives.holdAsSeen(run, seen);
    ElectiveSeats.RunView view = ElectiveSeatsController.openRun(run.id);
    CampLabels campWords = run.labels();
    ElectiveSeats.CamperInfo camper = camperOf(
      view,
      AgentFields.text(body, 'camper'),
      campWords
    );
    ElectivePeriod period = timeOf(view, body, campWords);
    ElectiveSeats.OfferingInfo offering = offeringOf(
      view,
      AgentFields.text(body, 'elective'),
      campWords
    );
    Map<String, Object> request = new Map<String, Object>{
      'runId' => run.id,
      'revision' => seen,
      'camperId' => camper.id,
      'day' => period.day,
      'blockId' => period.blockId,
      'offeringId' => offering.id
    };
    ElectiveSeats.RunView after;
    try {
      // The screen's own change of one seat.
      after = ElectiveSeatsController.changeSeat(JSON.serialize(request));
    } catch (Exception e) {
      String words = ScreenErrors.words(e);
      // Already there: said as it is, nothing changed (not a refusal).
      if (words == ElectiveSeatChange.alreadyIn(camper.name, offering.name)) {
        return words;
      }
      throw new ShoreshException(
        words.endsWith('; nothing changed.')
          ? words
          : 'That ' +
            run.labels().singularInSentence('Seats') +
            ' wasn\'t changed. ' +
            words
      );
    }
    // The screen's own words for it, and the offering over its seats then, as the screen shows it.
    ElectiveOverSeats.use(run.labels());
    String over = ElectiveOverSeats.atCampersTime(after, camper, period);
    String unset = ElectiveOverSeats.noSeatsSet(offering);
    return 'Moved ' +
      camper.name +
      ' to ' +
      offering.name +
      ', locked.' +
      (over == null ? '' : ' ' + over) +
      (unset == null ? '' : ' ' + unset);
  }

  /**
   * The camper by name or number, as read_elective_seats_now says them; never guessed. Refused in
   * the camp's words (words, CORE-1.0).
   */
  public static ElectiveSeats.CamperInfo camperOf(
    ElectiveSeats.RunView view,
    String asked,
    CampLabels words
  ) {
    List<ElectiveSeats.CamperInfo> found = new List<ElectiveSeats.CamperInfo>();
    for (ElectiveSeats.CamperInfo each : view.campers) {
      if (
        IncomingBatch.fold(each.name) == IncomingBatch.fold(asked) ||
        (String.isNotBlank(each.camperNumber) &&
        IncomingBatch.fold('#' + each.camperNumber) ==
        IncomingBatch.fold(asked.startsWith('#') ? asked : '#' + asked))
      ) {
        found.add(each);
      }
    }
    if (found.size() == 1) {
      return found[0];
    }
    throw new ShoreshException(
      found.isEmpty()
        ? 'There is no ' +
          words.singularInSentence('Camper') +
          ' called "' +
          asked.left(80) +
          '" in these ' +
          words.pluralInSentence('Seats') +
          '. Read them with read_elective_seats_now.'
        : 'Two ' +
          words.pluralInSentence('Camper') +
          ' are called "' +
          asked.left(80) +
          '". Say which by number, like #12.'
    );
  }

  /**
   * The time asked by its day (Monday, or 2026-06-29) and time block's name (day, time); refused
   * in the camp's Elective word (words, CORE-1.0).
   */
  public static ElectivePeriod timeOf(
    ElectiveSeats.RunView view,
    Map<String, Object> body,
    CampLabels words
  ) {
    String day = AgentFields.text(body, 'day');
    String block = AgentFields.text(body, 'time');
    List<String> said = new List<String>();
    for (ElectivePeriod each : view.times) {
      String weekday = WeekCalendar.weekdayName(each.day);
      if (
        (IncomingBatch.fold(weekday) == IncomingBatch.fold(day) ||
        IncomingBatch.fold(DayWords.say(each.day)) == IncomingBatch.fold(day) ||
        String.valueOf(each.day) == day) &&
        IncomingBatch.fold(each.blockName) == IncomingBatch.fold(block)
      ) {
        return each;
      }
      said.add(each.words());
    }
    throw new ShoreshException(
      'There is no ' +
        words.singularInSentence('Elective') +
        ' time on ' +
        day.left(40) +
        ' at ' +
        block.left(40) +
        '. ' +
        AgentWeeks.namesSaid('times', said)
    );
  }

  private static ElectiveSeats.OfferingInfo offeringOf(
    ElectiveSeats.RunView view,
    String asked,
    CampLabels words
  ) {
    List<String> names = new List<String>();
    for (ElectiveSeats.OfferingInfo each : view.offerings) {
      names.add(each.name);
    }
    Integer at = AgentFields.onlyOne(
      names,
      asked,
      words.withArticle('Elective')
    );
    if (at < 0) {
      throw new ShoreshException(
        'There is no ' +
          words.singularInSentence('Elective') +
          ' called "' +
          asked.left(80) +
          '" in these ' +
          words.pluralInSentence('Seats') +
          '. ' +
          AgentWeeks.namesSaid(words.pluralInSentence('Elective'), names)
      );
    }
    return view.offerings[at];
  }
}
