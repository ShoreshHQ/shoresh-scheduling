/**
 * A large camp's save going on in the background (repo ADR 0018 choice 59), as the AI is told it:
 * how far it has got, or why it stopped, as the screen shows it.
 */
public with sharing class AgentSaveProgress {
  /** What a save that went to the background says: reading again shows how far it got. */
  public static String stillSaving() {
    return 'this takes a few minutes. Read them again to see how far it has got; nothing else can change them until it is done.';
  }

  /** "Still saving: 9,000 of 12,000 written.", or why it stopped; no line when there is none. */
  public static List<String> saving(ElectiveBigSave.Progress save) {
    if (save == null) {
      return new List<String>();
    }
    return new List<String>{
      save.isSaving()
        ? 'Still saving: ' + save.count() + ' written.'
        : 'The last save stopped after ' + save.count() + ': ' + save.problem
    };
  }

  /** "Still clearing: 9,000 of 12,000 gone.", or why it stopped; no line when there is none. */
  public static List<String> clearing(ElectiveBigSave.Progress save) {
    if (save == null) {
      return new List<String>();
    }
    return new List<String>{
      save.isSaving()
        ? 'Still clearing: ' + save.count() + ' gone.'
        : 'The last clear stopped after ' + save.count() + ': ' + save.problem
    };
  }
}
