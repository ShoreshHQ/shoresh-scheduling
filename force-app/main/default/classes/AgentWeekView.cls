/**
 * A published week as Shoresh's Schedules screen shows it (docs/protocol/api.md API-1.26): web
 * address /v1/week_view?season=&week=, GET. For each program that published the week, what the
 * screen itself opens (SchedulesController.openSchedule: the days, the special days and events,
 * the rain marks), with the camp's words, so the connector draws Shoresh's own view of it and
 * no one draws their own. User mode: the person's own access.
 */
@RestResource(urlMapping='/v1/week_view')
global with sharing class AgentWeekView {
  @HttpGet
  global static void get() {
    RestRequest request = RestContext.request;
    RestResponse response = RestContext.response;
    response.addHeader('Content-Type', 'application/json');
    try {
      response.statusCode = 200;
      response.responseBody = Blob.valueOf(
        JSON.serialize(
          answer(request.params.get('season'), request.params.get('week'))
        )
      );
    } catch (Exception e) {
      response.statusCode = e instanceof ShoreshException ? 400 : 500;
      response.responseBody = Blob.valueOf(
        JSON.serialize(
          new Map<String, String>{
            'message' => e instanceof ShoreshException
              ? e.getMessage()
              : ScreenErrors.of(e).getMessage()
          }
        )
      );
    }
  }

  /**
   * { season, week, labels, programs: [ { program, view } ], opens }, published programs in order.
   * opens (API-1.28): the camp's own Salesforce address of the Schedules screen on this week's
   * published schedule (its first program's), never a sign-in address.
   */
  public static Map<String, Object> answer(String seasonName, String weekName) {
    Season__c season = OutgoingRows.seasonCalled(seasonName);
    Week__c week = OutgoingRows.weekIn(season, weekName);
    List<Object> programs = new List<Object>();
    Schedule__c first;
    for (Schedule__c schedule : [
      SELECT Id, Program__c, Program__r.Name
      FROM Schedule__c
      WHERE
        Week__c = :week.Id
        AND Program__r.Season__c = :season.Id
        AND Status__c = :SchedulePublish.PUBLISHED
      WITH USER_MODE
      ORDER BY Program__r.SortOrder__c, Program__r.Name, Id
      LIMIT 50
    ]) {
      if (first == null) {
        first = schedule;
      }
      programs.add(
        new Map<String, Object>{
          'program' => schedule.Program__r.Name,
          'view' => SchedulesController.openSchedule(schedule.Id)
        }
      );
    }
    if (programs.isEmpty()) {
      throw new ShoreshException(
        OutgoingPublished.notPublished(season, week.Name)
      );
    }
    Id campId = campOf(season);
    return new Map<String, Object>{
      'season' => season.Name,
      'week' => week.Name,
      'labels' => CampLabels.forCamp(campId).all(),
      'programs' => programs,
      'opens' => opens(campId, season.Id, week.Id, first)
    };
  }

  /** The Shoresh page opened on Schedules at this schedule (?c__preview=schedules, API-1.28). */
  @TestVisible
  private static String opens(
    Id campId,
    Id seasonId,
    Id weekId,
    Schedule__c at
  ) {
    String ns = ShoreshSchema.namespace();
    return URL.getOrgDomainUrl().toExternalForm() +
      '/lightning/n/' +
      (ns == null ? '' : ns + '__') +
      'Shoresh_Camp_Setup?c__preview=schedules&c__camp=' +
      campId +
      '&c__season=' +
      seasonId +
      '&c__program=' +
      at.Program__c +
      '&c__week=' +
      weekId +
      '&c__schedule=' +
      at.Id;
  }

  private static Id campOf(Season__c season) {
    return [SELECT Camp__c FROM Season__c WHERE Id = :season.Id WITH USER_MODE]
    .Camp__c;
  }
}
