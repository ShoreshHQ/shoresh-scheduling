/**
 * A large camp's save going on in the background (repo ADR 0018 choice 59), as the AI is told it:
 * how far it has got, or why it stopped, as the screen shows it.
 */
public with sharing class AgentSaveProgress {
  /** What a save that went to the background says: reading again shows how far it got. */
  public static String stillSaving() {
    return 'this takes a few minutes. Read them again to see how far it has got; nothing else can change them until it is done.';
  }

  /** "9,000 of 12,000": how far a save has got; null when there is none. */
  public static String countOf(Decimal done, Decimal total) {
    return total == null
      ? null
      : done.intValue().format() + ' of ' + total.intValue().format();
  }

  /** "Still saving: 9,000 of 12,000 written.", or why it stopped; no line when there is none. */
  public static List<String> saving(String count, String problem) {
    if (count == null) {
      return new List<String>();
    }
    return new List<String>{
      problem == null
        ? 'Still saving: ' + count + ' written.'
        : 'The last save stopped after ' + count + ': ' + problem
    };
  }

  /** "Still clearing: 9,000 of 12,000 gone.", or why it stopped; no line when there is none. */
  public static List<String> clearing(String count, String problem) {
    if (count == null) {
      return new List<String>();
    }
    return new List<String>{
      problem == null
        ? 'Still clearing: ' + count + ' gone.'
        : 'The last clear stopped after ' + count + ': ' + problem
    };
  }
}
