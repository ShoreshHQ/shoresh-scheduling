/**
 * The seasons a person can see, each with its weeks and programs, and the one Shoresh's screens
 * open on (docs/protocol/api.md API-1.24): web address /v1/seasons, GET. So an AI never has to
 * guess a season's or a week's name. User mode: only what the person can see.
 */
@RestResource(urlMapping='/v1/seasons')
global with sharing class AgentSeasons {
  @HttpGet
  global static void get() {
    RestResponse response = RestContext.response;
    response.addHeader('Content-Type', 'application/json');
    try {
      response.statusCode = 200;
      response.responseBody = Blob.valueOf(JSON.serialize(answer()));
    } catch (Exception e) {
      response.statusCode = e instanceof ShoreshException ? 400 : 500;
      response.responseBody = Blob.valueOf(
        JSON.serialize(
          new Map<String, String>{
            'message' => e instanceof ShoreshException
              ? e.getMessage()
              : ScreenErrors.words(e)
          }
        )
      );
    }
  }

  /** { opens_on: the season the screens open on, or null; seasons: [ ... ] }. */
  public static Map<String, Object> answer() {
    List<Season__c> seen = OutgoingRows.seasonsSeen();
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
      seasons.add(
        new Map<String, Object>{
          'season' => season.Name,
          'camp' => season.Camp__r.Name,
          'start_date' => season.StartDate__c,
          'end_date' => season.EndDate__c,
          'weeks' => weeks.get(season.Id),
          'programs' => programs.get(season.Id)
        }
      );
    }
    String opensOn;
    try {
      opensOn = OutgoingRows.seasonToOpen().Name;
    } catch (ShoreshException e) {
      opensOn = null;
    }
    return new Map<String, Object>{
      'opens_on' => opensOn,
      'seasons' => seasons
    };
  }
}
