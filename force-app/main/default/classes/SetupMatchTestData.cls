/**
 * Reading what "Update to match setup" (SetupMatch) answers, for SetupMatchTest: the dots by cell,
 * a change by where it is, Monday's change, the keys, and what a Monday cell holds.
 */
@IsTest
public class SetupMatchTestData {
  public static final Date MONDAY = Date.newInstance(2026, 6, 29);

  public static Map<String, String> dotsOf(SetupMatch.Preview preview) {
    Map<String, String> result = new Map<String, String>();
    for (SetupMatch.Dot dot : preview.dots) {
      result.put(dot.key, dot.words);
    }
    return result;
  }

  /** The changes on Monday for a group, by the line's place. */
  public static SetupMatch.Change changeAt(
    SetupMatch.Preview preview,
    String place
  ) {
    for (SetupMatch.Change change : preview.changes) {
      for (SetupMatch.Line line : change.lines) {
        if (line.place == place) {
          return change;
        }
      }
    }
    Assert.fail('No change at ' + place + ' in ' + JSON.serialize(preview));
    return null;
  }

  /** What a group's Monday cell holds now ('' Open, else the item's name). */
  public static String mondayAt(
    ManualBuildViews.DraftView view,
    String groupName,
    String blockName
  ) {
    ScheduleViews.DayView day = view.schedule.days[0];
    Integer b = -1;
    for (Integer i = 0; i < day.blocks.size(); i++) {
      if (day.blocks[i].name == blockName) {
        b = i;
      }
    }
    for (Integer g = 0; g < day.groups.size(); g++) {
      if (day.groups[g].name == groupName) {
        String token = day.rows[g].split(',', -1)[b];
        return String.isBlank(token) || token == '^'
          ? token
          : day.items[Integer.valueOf(token) - 1].name;
      }
    }
    return null;
  }

  public static List<String> keysOf(SetupMatch.Preview preview) {
    List<String> keys = new List<String>();
    for (SetupMatch.Change change : preview.changes) {
      keys.add(change.key);
    }
    return keys;
  }

  /** The change dated Monday. */
  public static SetupMatch.Change mondayChange(SetupMatch.Preview preview) {
    for (SetupMatch.Change change : preview.changes) {
      if (change.dateValue == MONDAY) {
        return change;
      }
    }
    Assert.fail('No Monday change in ' + JSON.serialize(preview));
    return null;
  }
}
