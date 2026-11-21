/**
 * The seasons a person can see, each with its weeks and programs, and the one Shoresh's screens
 * open on (docs/protocol/api.md API-1.24): web address /v1/seasons, GET. So an AI never has to
 * guess a season's or a week's name. User mode: only what the person can see, and only the fields
 * they can read.
 */
@RestResource(urlMapping='/v1/seasons')
global with sharing class AgentSeasons implements AgentRequest.Read {
  @HttpGet
  global static void get() {
    AgentRequest.answer(new AgentSeasons());
  }

  /** None: every season the person can see. */
  public Set<String> fields() {
    return new Set<String>();
  }

  public String run(Map<String, Object> asked) {
    return JSON.serialize(answer());
  }

  /** The camp's "In a short week" choice, as the season form has it (WEEK-4.2). */
  public static String shortWeekOf(Season__c season) {
    return season.ShrinkShortWeek__c ? 'lower' : 'keep';
  }

  /** The camps the person can see, so an AI can tell no camp from a camp with no season (API-1.139). */
  private static List<String> camps() {
    List<String> names = new List<String>();
    for (Camp__c camp : SeasonSetupController.getCamps()) {
      names.add(camp.Name);
    }
    return names;
  }

  /** { opens_on: the season the screens open on, or null; seasons: [ ... ]; camps: their names }. */
  public static Map<String, Object> answer() {
    // Which seasons, in the screens' order, is seasonsSeen's; what is said of each is read again
    // as the person, so a field they can't read is never said.
    List<Season__c> listed = OutgoingRows.seasonsSeen();
    Map<Id, Season__c> asPerson = new Map<Id, Season__c>(
      [
        SELECT
          Id,
          Name,
          Camp__r.Name,
          StartDate__c,
          EndDate__c,
          ShrinkShortWeek__c,
          Archived__c
        FROM Season__c
        WHERE Id IN :new Map<Id, Season__c>(listed).keySet()
        WITH USER_MODE
      ]
    );
    List<Season__c> seen = new List<Season__c>();
    for (Season__c season : listed) {
      seen.add(asPerson.get(season.Id));
    }
    Map<Id, List<String>> weeks = new Map<Id, List<String>>();
    Map<Id, List<String>> programs = new Map<Id, List<String>>();
    for (Season__c season : seen) {
      weeks.put(season.Id, new List<String>());
      programs.put(season.Id, new List<String>());
    }
    for (Week__c week : [
      SELECT Name, Season__c
      FROM Week__c
      WHERE Season__c IN :weeks.keySet()
      WITH USER_MODE
      ORDER BY SortOrder__c, StartDate__c
    ]) {
      weeks.get(week.Season__c).add(week.Name);
    }
    for (Program__c program : [
      SELECT Name, Season__c
      FROM Program__c
      WHERE Season__c IN :programs.keySet()
      WITH USER_MODE
      ORDER BY SortOrder__c, Name
    ]) {
      programs.get(program.Season__c).add(program.Name);
    }
    List<Object> seasons = new List<Object>();
    for (Season__c season : seen) {
      Map<String, Object> said = new Map<String, Object>{
        'season' => season.Name,
        'camp' => season.Camp__r?.Name,
        'start_date' => season.StartDate__c,
        'end_date' => season.EndDate__c,
        'short_week' => shortWeekOf(season),
        'weeks' => weeks.get(season.Id),
        'programs' => programs.get(season.Id)
      };
      // WEEK-1.11: an archived season is listed, marked, and read-only.
      if (season.Archived__c) {
        said.put('archived', true);
      }
      seasons.add(said);
    }
    String opensOn;
    try {
      opensOn = OutgoingRows.seasonToOpen().Name;
    } catch (ShoreshException e) {
      opensOn = null;
    }
    return new Map<String, Object>{
      'opens_on' => opensOn,
      'seasons' => seasons,
      'camps' => camps()
    };
  }
}
