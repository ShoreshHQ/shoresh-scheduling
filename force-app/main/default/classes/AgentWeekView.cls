/**
 * A published week as Shoresh's Schedules screen shows it (docs/protocol/api.md API-1.26): web
 * address /v1/week_view?season=&week=, GET. For each program that published the week, what the
 * screen itself opens (SchedulesController.openSchedule: the days, the special days and events,
 * the rain marks; every program's read together, openSchedules), with the camp's words, so the
 * connector draws Shoresh's own view of it and no one draws their own. User mode: the person's
 * own access.
 */
@RestResource(urlMapping='/v1/week_view')
global with sharing class AgentWeekView implements AgentRequest.Read {
  @HttpGet
  global static void get() {
    AgentRequest.answer(new AgentWeekView());
  }

  public Set<String> fields() {
    return new Set<String>{ 'season', 'week' };
  }

  public String run(Map<String, Object> asked) {
    return JSON.serialize(
      answer((String) asked.get('season'), (String) asked.get('week'))
    );
  }

  /**
   * { week, labels, programs: [ { program, view } ], opens }, published programs in order (the
   * read's answer says its season too, API-1.108).
   * opens (API-1.28): the camp's own Salesforce address of the Schedules screen on this week's
   * published schedule (its first program's), never a sign-in address.
   */
  public static Map<String, Object> answer(String seasonName, String weekName) {
    Season__c season = OutgoingRows.seasonCalled(seasonName);
    Week__c week = OutgoingRows.weekIn(season, weekName);
    List<Schedule__c> published = [
      SELECT Id, Program__c, Week__c, Program__r.Name
      FROM Schedule__c
      WHERE
        Week__c = :week.Id
        AND Program__r.Season__c = :season.Id
        AND Status__c = :SchedulePublish.PUBLISHED
      WITH USER_MODE
      ORDER BY Program__r.SortOrder__c, Program__r.Name, Id
      LIMIT 50
    ];
    if (published.isEmpty()) {
      throw new ShoreshException(
        OutgoingPublished.notPublished(season, week.Name)
      );
    }
    List<Id> scheduleIds = new List<Id>();
    for (Schedule__c schedule : published) {
      scheduleIds.add(schedule.Id);
    }
    // Every program's published week opened together, as the screen opens one (G8).
    List<ScheduleViews.ScheduleView> views = SchedulesController.openSchedules(
      scheduleIds
    );
    List<Object> programs = new List<Object>();
    for (Integer i = 0; i < published.size(); i++) {
      programs.add(
        new Map<String, Object>{
          'program' => published[i].Program__r.Name,
          'view' => views[i]
        }
      );
    }
    Id campId = campOf(season);
    return new Map<String, Object>{
      'week' => week.Name,
      'labels' => CampLabels.forCamp(campId).all(),
      'dayNaming' => DayWords.namingOf(season.Id),
      'programs' => programs,
      'opens' => opens(campId, season.Id, published[0])
    };
  }

  /** The Shoresh page opened on Schedules at this schedule (?c__preview=schedules, API-1.28). */
  private static String opens(Id campId, Id seasonId, Schedule__c at) {
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
      at.Week__c +
      '&c__schedule=' +
      at.Id;
  }

  private static Id campOf(Season__c season) {
    return [SELECT Camp__c FROM Season__c WHERE Id = :season.Id WITH USER_MODE]
    .Camp__c;
  }
}
