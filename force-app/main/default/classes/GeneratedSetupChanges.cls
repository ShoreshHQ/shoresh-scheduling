/**
 * What changed in setup between opening a week that had no Generated draft and its first save
 * (GeneratedSaves): the blank week is built again under the program's lock, and if it isn't the
 * one the engine built on, the save is a conflict that says what changed, in camp words, so the
 * director opens the week again. Nobody's work is lost: there was no draft yet.
 */
public with sharing class GeneratedSetupChanges {
  private Program__c program;
  private CampLabels labels;

  private GeneratedSetupChanges(Program__c program) {
    this.program = program;
    this.labels = CampLabels.forCamp(program.Season__r.Camp__c);
  }

  /** The sentence for what changed, or null when the blank week is still the one built on. */
  public static String of(
    Program__c program,
    List<ScheduleDays.DayGrid> blank,
    List<GeneratedWeek.Day> sent
  ) {
    GeneratedSetupChanges changes = new GeneratedSetupChanges(program);
    Map<Date, GeneratedWeek.Day> byDate = GeneratedFrames.byDate(sent);
    if (!sameDates(blank, byDate)) {
      return changes.sentence(program.Name + '\'s days');
    }
    for (ScheduleDays.DayGrid day : blank) {
      String changed = changes.onDay(day, byDate.get(day.day));
      if (changed != null) {
        return changes.sentence(changed);
      }
    }
    return null;
  }

  private static Boolean sameDates(
    List<ScheduleDays.DayGrid> blank,
    Map<Date, GeneratedWeek.Day> byDate
  ) {
    Boolean same = blank.size() == byDate.size();
    for (ScheduleDays.DayGrid day : blank) {
      same = same && byDate.containsKey(day.day);
    }
    return same;
  }

  /** What changed on one day: its time blocks, its groups, or a fixed or recurring activity. */
  private String onDay(ScheduleDays.DayGrid day, GeneratedWeek.Day built) {
    String weekday = BlankWeek.weekdayOf(day.day);
    if (!GeneratedFrames.sameIds(day.grid.blockIds(), built.blockIds)) {
      return program.Name +
        '\'s ' +
        labels.pluralInSentence('TimeBlock') +
        ' on ' +
        weekday;
    }
    if (!GeneratedFrames.sameIds(day.grid.groupIds(), built.groupIds)) {
      return program.Name +
        '\'s ' +
        labels.pluralInSentence('Group') +
        ' on ' +
        weekday;
    }
    return setTimeChange(day.grid, GeneratedGrids.of(day.grid, built), weekday);
  }

  /** A cell where a fixed or recurring activity is now, or was when the week was opened. */
  private static String setTimeChange(
    ScheduleGrid blank,
    ScheduleGrid built,
    String weekday
  ) {
    for (Integer g = 0; g < blank.groups.size(); g++) {
      List<String> setup = SlotIds.ofRow(blank, g);
      List<String> builtOn = SlotIds.ofRow(built, g);
      for (Integer b = 0; b < setup.size(); b++) {
        Boolean setTime =
          SlotIds.isSetTime(setup[b]) || SlotIds.isSetTime(builtOn[b]);
        if (setTime && !setup[b].equals(builtOn[b])) {
          return blank.blocks[b].name +
            ' for ' +
            blank.groups[g].name +
            ' on ' +
            weekday;
        }
      }
    }
    return null;
  }

  private String sentence(String changed) {
    return changed +
      ' changed since you opened this ' +
      labels.singularInSentence('Week') +
      '. Open it again, then generate.';
  }
}
