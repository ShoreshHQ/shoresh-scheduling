/**
 * download_schedule (docs/protocol/api.md API-1.86): what the Schedules screen reads before its
 * Excel and Print. Web address /v1/schedule_file, GET ?season=&week=&program=&version=&saved=.
 * The week's version as the screen opens it (SchedulesController.openSchedule): the one named,
 * found as list_versions names it, or the newest, as the screen opens by itself; with the
 * season's setup (its activities, places, elective offerings and the camp's words).
 */
@RestResource(urlMapping='/v1/schedule_file')
global with sharing class AgentScheduleFile implements AgentFiles.Read {
  @HttpGet
  global static void get() {
    AgentFiles.answer(new AgentScheduleFile());
  }

  public Set<String> fields() {
    return new Set<String>{ 'season', 'week', 'program', 'version', 'saved' };
  }

  public String run(Map<String, Object> asked) {
    Season__c season = AgentFiles.seasonOf(asked);
    AgentWeeks.Week week = new AgentWeeks.Week();
    week.season = season;
    Week__c found = AgentWeeks.weekIn(season, AgentFields.text(asked, 'week'));
    week.weekId = found.Id;
    week.name = found.Name;
    week.program = AgentWeeks.programOf(
      season,
      AgentFields.text(asked, 'program')
    );
    ScheduleViews.VersionRow version;
    if (String.isBlank(AgentFields.text(asked, 'version'))) {
      List<ScheduleViews.VersionRow> rows = SchedulesController.getVersions(
        week.program.Id,
        week.weekId
      );
      if (rows.isEmpty()) {
        throw new ShoreshException(
          week.name +
            ' has no schedule for ' +
            week.program.Name +
            ' yet, so there is nothing to download.'
        );
      }
      version = rows[0];
    } else {
      version = AgentVersions.named(week, asked);
    }
    return AgentFiles.joined(
      new Map<String, String>{
        'week' => JSON.serialize(week.name),
        'program' => JSON.serialize(week.program.Name),
        'version' => JSON.serialize(version.name),
        'opened' => JSON.serialize(
          SchedulesController.openSchedule(version.id)
        ),
        'setup' => AgentFiles.setupOf(season)
      }
    );
  }
}
