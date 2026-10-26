/**
 * A generated week as Start over sends it (the screen's clearedDays, ADR 0010): every activity
 * taken out of every day; fixed and recurring activities, specials and electives stay. Synthetic
 * data only.
 */
@IsTest
public class StartOverTestData {
  public static GeneratedWeek.Save cleared(GeneratedWeek.Save save) {
    for (GeneratedWeek.Day day : save.days) {
      clear(day);
    }
    return save;
  }

  /** One day: its rows without activities, its items without those no row uses now. */
  private static void clear(GeneratedWeek.Day day) {
    Kept kept = new Kept();
    for (Integer g = 0; g < day.rows.size(); g++) {
      List<String> tokens = day.rows[g].split(',', -1);
      Boolean dropped = false;
      for (Integer b = 0; b < tokens.size(); b++) {
        if (tokens[b] == ScheduleGrid.CARRIES_ON) {
          tokens[b] = dropped ? '' : tokens[b];
          continue;
        }
        GeneratedWeek.Item placed = itemOf(day, tokens[b]);
        dropped = placed == null || placed.kind == 'A';
        tokens[b] = dropped ? '' : kept.numberOf(placed, tokens[b]);
      }
      day.rows[g] = String.join(tokens, ',');
    }
    day.items = kept.items;
  }

  private static GeneratedWeek.Item itemOf(
    GeneratedWeek.Day day,
    String token
  ) {
    return String.isBlank(token) ? null : day.items[Integer.valueOf(token) - 1];
  }

  /** The day's items kept, and each old token's new number. */
  private class Kept {
    List<GeneratedWeek.Item> items = new List<GeneratedWeek.Item>();
    Map<String, String> numbers = new Map<String, String>();

    String numberOf(GeneratedWeek.Item placed, String token) {
      if (!numbers.containsKey(token)) {
        items.add(placed);
        numbers.put(token, String.valueOf(items.size()));
      }
      return numbers.get(token);
    }
  }
}
