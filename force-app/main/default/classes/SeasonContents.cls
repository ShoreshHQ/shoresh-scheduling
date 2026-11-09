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
    List<String> lines = new List<String>();
    addLine(lines, labels, 'Week', sizeOf(setup.weeks));
    addLine(lines, labels, 'Program', sizeOf(setup.programs));
    addLine(lines, labels, 'Division', counts.divisions);
    addLine(lines, labels, 'Group', counts.groups);
    addLine(lines, labels, 'TimeBlock', counts.timeBlocks);
    addLine(lines, labels, 'Location', sizeOf(setup.locations));
    addLine(lines, labels, 'Activity', sizeOf(setup.activities));
    addLine(lines, labels, 'FixedActivity', counts.fixedActivities);
    addLine(lines, labels, 'RecurringActivity', counts.recurringActivities);
    addLine(
      lines,
      labels,
      'SpecialDay',
      setup.special?.specialDays?.size() ?? 0
    );
    addLine(
      lines,
      labels,
      'SpecialEvent',
      setup.special?.specialEvents?.size() ?? 0
    );
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

  private static void addLine(
    List<String> lines,
    CampLabels labels,
    String term,
    Integer count
  ) {
    if (count > 0) {
      lines.add(
        count + ' ' + (count == 1 ? labels.singular(term) : labels.plural(term))
      );
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
