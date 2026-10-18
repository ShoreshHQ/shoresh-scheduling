/**
 * Other programs' PUBLISHED schedules for the week, cell by cell, for OtherProgramUse: each
 * group's cell counts at its activity's place and for the activity (a fixed or recurring
 * activity at its place), at its time block's own start and end. Only Status Published counts
 * (a draft or version never does); should a program have more than one, the newest. A group
 * away, a place closed, or a fixed or recurring activity off that week doesn't count, as for
 * setup's (OtherProgramSetTime). A cell whose Id can't be read is skipped. One query in user
 * mode.
 */
public with sharing class OtherProgramGrids {
  private static final String PUBLISHED = 'Published';
  private final OtherProgramUse tally;
  // An activity, fixed activity or recurring activity -> its place.
  private final Map<Id, Id> places;

  public OtherProgramGrids(OtherProgramUse tally, Map<Id, Id> places) {
    this.tally = tally;
    this.places = places;
  }

  /**
   * Adds each program's published days of the week. Returns "programId|date" for each day
   * counted (a day that can't be read isn't: its fixed and recurring activities count instead).
   */
  public Set<String> add(Set<Id> programIds) {
    Map<String, List<ScheduleDay__c>> partsByDay = publishedDays(programIds);
    Set<String> counted = new Set<String>();
    for (String key : partsByDay.keySet()) {
      List<ScheduleDay__c> parts = partsByDay.get(key);
      ScheduleDays.DayGrid day = ScheduleDays.readDay(parts[0].Date__c, parts);
      if (day.grid != null) {
        addDay(day);
        counted.add(key);
      }
    }
    return counted;
  }

  /** "programId|date" -> that day's parts, of each program's newest published schedule. */
  private Map<String, List<ScheduleDay__c>> publishedDays(Set<Id> programIds) {
    Map<String, List<ScheduleDay__c>> partsByDay = new Map<String, List<ScheduleDay__c>>();
    Map<Id, Id> scheduleByProgram = new Map<Id, Id>();
    for (ScheduleDay__c part : [
      SELECT
        Date__c,
        Part__c,
        Grid__c,
        GridFormatVersion__c,
        Revision__c,
        Schedule__c,
        Schedule__r.Program__c
      FROM ScheduleDay__c
      WHERE
        Schedule__r.Week__c = :tally.week.Id
        AND Schedule__r.Status__c = :PUBLISHED
        AND Schedule__r.Program__c IN :programIds
      WITH USER_MODE
      ORDER BY
        Schedule__r.Program__c,
        Schedule__r.CreatedDate DESC,
        Schedule__c DESC,
        Date__c,
        Part__c
    ]) {
      Id programId = part.Schedule__r.Program__c;
      if (!scheduleByProgram.containsKey(programId)) {
        scheduleByProgram.put(programId, part.Schedule__c);
      }
      if (scheduleByProgram.get(programId) == part.Schedule__c) {
        String key = programId + '|' + String.valueOf(part.Date__c);
        if (!partsByDay.containsKey(key)) {
          partsByDay.put(key, new List<ScheduleDay__c>());
        }
        partsByDay.get(key).add(part);
      }
    }
    return partsByDay;
  }

  private void addDay(ScheduleDays.DayGrid day) {
    ScheduleGrid grid = day.grid;
    for (Integer g = 0; g < grid.groups.size(); g++) {
      Id groupId = idOf(grid.groups[g].id);
      if (groupId != null && !tally.isOff(groupId)) {
        addRow(day.day, grid, g);
      }
    }
  }

  /** One group's cells: what is placed in each, the carried-on blocks included. */
  private void addRow(Date day, ScheduleGrid grid, Integer g) {
    List<String> row = grid.rows[g];
    String owner = '';
    for (Integer b = 0; b < Math.min(grid.blocks.size(), row.size()); b++) {
      owner = row[b] == ScheduleGrid.CARRIES_ON ? owner : row[b];
      if (String.isNotBlank(owner)) {
        OtherProgramUse.Entry entry = OtherProgramUse.at(
          day,
          grid.blocks[b].startTime,
          grid.blocks[b].endTime
        );
        place(entry, grid.items[Integer.valueOf(owner) - 1]);
        entry.groups = 1;
        tally.add(entry);
      }
    }
  }

  /**
   * An activity counts at its place and for itself; a fixed or recurring one at its place. Not
   * for a fixed or recurring activity off this week, nor at a place closed this week (the same
   * rules as for setup's, OtherProgramSetTime).
   */
  private void place(OtherProgramUse.Entry entry, ScheduleGrid.Item item) {
    Boolean setUp = item.kind == 'A' || item.kind == 'F' || item.kind == 'R';
    Id itemId = idOf(item.id);
    if (!setUp || itemId == null || tally.isOff(itemId)) {
      // Not set up in Shoresh yet (an elective, a trip...), or off this week: nothing to count.
      return;
    }
    Id placeId = places.get(itemId);
    entry.locationId = tally.isOff(placeId) ? null : placeId;
    entry.activityId = item.kind == 'A' ? itemId : null;
  }

  /** A grid's Id text as an Id; null for one that isn't (skipped, never a failed screen). */
  private static Id idOf(String text) {
    try {
      return String.isBlank(text) ? null : Id.valueOf(text);
    } catch (StringException e) {
      return null;
    }
  }
}
