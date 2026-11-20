/**
 * read_electives_to_clear: what the Elective seats screen's end-of-season Clear shows before it
 * clears, through an agent or the command line (docs/protocol/api.md API-1.71). Web address
 * /v1/electives_to_clear, GET ?season=. It is the screen's own picture
 * (ElectiveSeatsController.clearPicture): each week's campers, choices, seats and runs, what is
 * still being worked on, and what stays for next summer, with the picture as read (seen, its
 * stamp).
 */
@RestResource(urlMapping='/v1/electives_to_clear')
global with sharing class AgentElectivesToClear implements AgentRequest.SentenceRead {
  @HttpGet
  global static void get() {
    AgentRequest.answer(new AgentElectivesToClear());
  }

  public Set<String> fields() {
    return new Set<String>{ 'season' };
  }

  public String run(Map<String, Object> asked) {
    AgentWeeks.requireScheduler();
    Season__c season = OutgoingRows.seasonCalled((String) asked.get('season'));
    return said(
      ElectiveSeatsController.clearPicture(season.Id),
      IncomingSeason.labelsOf(season.Id)
    );
  }

  /** "2 sets of seats, 1 of them final"; "1 set of seats, final" (or draft); seats: the camp's. */
  private static String seatSets(Integer runs, Integer finals, String seats) {
    if (runs == 1) {
      return '1 set of ' + seats + ', ' + (finals == 1 ? 'final' : 'draft');
    }
    return runs + ' sets of ' + seats + ', ' + finals + ' of them final';
  }

  /**
   * The Elective set word beside the Elective word, as the screens' setsBesideElectives: "Chug
   * sets" where the camp's sets follow its "Chugim" (CORE-1.34), so the two never read alike.
   */
  private static String setsBesideElectives(CampLabels words) {
    String sets = words.pluralInSentence('ElectiveSet');
    return sets.equals(words.pluralInSentence('Elective'))
      ? words.singular('Elective') + ' sets'
      : sets;
  }

  /** The picture, in lines, in the camp's words (words, CORE-1.0). */
  public static String said(ElectiveClear.Picture picture, CampLabels words) {
    String campers = words.pluralInSentence('Camper');
    String seats = words.pluralInSentence('Seats');
    List<String> lines = new List<String>{
      picture.seasonName +
      ': ' +
      picture.campers +
      ' ' +
      campers +
      ' in all. seen: ' +
      picture.stamp
    };
    for (ElectiveClear.WeekCounts week : picture.weeks) {
      lines.add(
        '- ' +
          week.name +
          ': ' +
          week.campers +
          ' ' +
          campers +
          ' (' +
          week.campersOnlyHere +
          ' only this week), ' +
          week.choices +
          ' choices, ' +
          week.seats +
          ' ' +
          seats +
          ', ' +
          seatSets(week.runs, week.finals, seats) +
          (week.working.isEmpty()
            ? ''
            : '; still being worked on: ' + String.join(week.working, ', '))
      );
    }
    lines.add(
      'Stays for next summer: ' +
        setsBesideElectives(words) +
        ' ' +
        String.join(picture.sets, ', ') +
        '; ' +
        words.pluralInSentence('Elective') +
        ' ' +
        String.join(picture.offerings, ', ') +
        (picture.linked.isEmpty()
          ? ''
          : '; ' +
            words.pluralInSentence('LinkedChoice') +
            ' ' +
            String.join(picture.linked, ', ')) +
        '.'
    );
    return String.join(lines, '\n');
  }
}
