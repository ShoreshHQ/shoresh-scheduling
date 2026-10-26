/**
 * What "Update to match setup" says about a cell of a draft (its dots), for tests of hand edits'
 * reminders (ADR 0008 part 12). Synthetic data only.
 */
@IsTest
public class SetupReminders {
  /** The words of the dot on a cell (cell: group Id, time block Id) on a day, or null. */
  public static String at(List<SetupMatch.Dot> dots, Date day, List<Id> cell) {
    for (SetupMatch.Dot dot : dots) {
      List<String> parts = dot.key.split('\\|');
      if (
        parts[0] == String.valueOf(day) &&
        Id.valueOf(parts[1]) == cell[0] &&
        Id.valueOf(parts[2]) == cell[1]
      ) {
        return dot.words;
      }
    }
    return null;
  }
}
