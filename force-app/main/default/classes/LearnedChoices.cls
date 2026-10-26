/**
 * The answers "What Shoresh has learned" may give a remembered question when it is changed there
 * (repo ADR 0021). A question's family is the start of its key (ADR 0006 §19-21): only families
 * whose answers are fixed words can be changed on that screen; those answered with a name (a
 * program, a division, a column) or a value (what was guessed, what was deleted) can only be
 * forgotten, so the next import asks again. Mirrors c/shoreshLearned kinds.js, which shows them.
 */
public with sharing class LearnedChoices {
  private static final Set<String> KEEP_OR_CHANGE = new Set<String>{
    'keep',
    'change'
  };
  private static final Map<String, Set<String>> BY_FAMILY = new Map<String, Set<String>>{
    'kind' => new Set<String>{ 'fixed', 'recurring', 'activity' },
    'similar' => new Set<String>{ 'a', 'b', 'different' },
    'ampm' => new Set<String>{ 'morning', 'evening' },
    'tueThu' => new Set<String>{ 'Tuesday', 'Thursday' },
    'dash' => new Set<String>{ 'range', 'list' },
    'programDay' => new Set<String>{ 'add', 'drop' },
    'list' => new Set<String>{ 'one', 'several' }
  };

  /**
   * The answers a question may be changed to, or null when it can only be forgotten. A time
   * block's change is not offered: whether "change" was a choice depended on that file.
   */
  public static Set<String> allowed(String question) {
    String family = String.isBlank(question)
      ? ''
      : question.substringBefore('|');
    if (family == 'change') {
      return question.startsWith('change|block|') ? null : KEEP_OR_CHANGE;
    }
    return BY_FAMILY.get(family);
  }

  /** Whether the question may be changed to this answer on the screen. */
  public static Boolean allows(String question, String answer) {
    Set<String> choices = allowed(question);
    return choices != null && choices.contains(answer);
  }
}
