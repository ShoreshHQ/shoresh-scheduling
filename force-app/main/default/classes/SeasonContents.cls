/**
 * What deleting a season takes with it, one line per kind that has any ("4 Weeks"), in the camp's
 * words; saved schedules last. A season with nothing in it says so. The one place Delete season's
 * question is said, on the screen and to an AI (SetupDelete, API-1.141). Read in user mode.
 */
public with sharing class SeasonContents {
  public static List<String> of(Id seasonId) {
    SeasonSetupReader.SeasonSetup setup = SeasonSetupController.getSeasonSetup(
      seasonId
    );
    Id campId = [
      SELECT Camp__c
      FROM Season__c
      WHERE Id = :seasonId
      WITH USER_MODE
    ]
    .Camp__c;
    CampLabels labels = CampLabels.forCamp(campId);
    Counts counts = new Counts();
    for (SeasonSetupReader.ProgramSetup entry : setup.programs) {
      counts.add(entry);
    }
    Lines said = new Lines(labels);
    said.add('Week', sizeOf(setup.weeks));
    said.add('Program', sizeOf(setup.programs));
    said.add('Division', counts.divisions);
    said.add('Group', counts.groups);
    said.add('TimeBlock', counts.timeBlocks);
    said.add('Location', sizeOf(setup.locations));
    said.add('Activity', sizeOf(setup.activities));
    said.add('FixedActivity', counts.fixedActivities);
    said.add('RecurringActivity', counts.recurringActivities);
    said.add('SpecialDay', setup.special?.specialDays?.size() ?? 0);
    said.add('SpecialEvent', setup.special?.specialEvents?.size() ?? 0);
    List<String> lines = said.lines;
    Integer schedules = sizeOf(setup.schedules);
    if (schedules > 0) {
      lines.add(
        schedules + (schedules == 1 ? ' saved schedule' : ' saved schedules')
      );
    }
    return lines.isEmpty()
      ? new List<String>{ 'Nothing set up in it yet' }
      : lines;
  }

  private static Integer sizeOf(List<Object> rows) {
    return rows == null ? 0 : rows.size();
  }

  private class Lines {
    List<String> lines = new List<String>();
    CampLabels labels;

    Lines(CampLabels labels) {
      this.labels = labels;
    }

    void add(String term, Integer count) {
      if (count > 0) {
        lines.add(
          count +
            ' ' +
            (count == 1 ? labels.singular(term) : labels.plural(term))
        );
      }
    }
  }

  private class Counts {
    Integer divisions = 0;
    Integer groups = 0;
    Integer timeBlocks = 0;
    Integer fixedActivities = 0;
    Integer recurringActivities = 0;

    void add(SeasonSetupReader.ProgramSetup entry) {
      timeBlocks += sizeOf(entry.timeBlocks);
      fixedActivities += sizeOf(entry.fixedActivities);
      recurringActivities += sizeOf(entry.recurringActivities);
      for (SeasonSetupReader.DivisionSetup each : entry.divisions) {
        groups += sizeOf(each.groups);
        // DIV-1.1: holding records are not counted as divisions.
        if (!each.division.NoDivision__c) {
          divisions++;
        }
      }
    }
  }
}
