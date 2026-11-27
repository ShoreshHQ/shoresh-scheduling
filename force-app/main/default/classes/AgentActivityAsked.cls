/**
 * What change_activity_details was asked (API-1.51), beside AgentActivityRules: that each field
 * changed comes with what was seen in it, the fields other than when it runs (read on its own,
 * AgentActivityRuns), and what was seen said as the panel shows it.
 */
public with sharing class AgentActivityAsked {
  /** The panel's fields but when it runs and who leads it (each saved on its own), in its order. */
  public static List<String> rulesAndWho() {
    List<String> result = AgentActivityRules.names();
    result.remove(result.indexOf(AgentActivityRules.RUNS));
    result.remove(result.indexOf(AgentActivityRules.LEADS));
    return result;
  }

  /** Each changed field needs what was seen in it: Shoresh never reads it in its place. */
  public static void refuseUnseen(
    Map<String, Object> given,
    Map<String, Object> seen
  ) {
    List<String> missing = new List<String>();
    for (String key : AgentActivityRules.names()) {
      if (given.containsKey(key) && !seen.containsKey(key)) {
        missing.add(key);
      }
    }
    if (!missing.isEmpty()) {
      throw new ShoreshException(
        'Say what each field held when you read it (seen: ' +
          String.join(missing, ', ') +
          '), as read_activity_details gives it, so a change someone made since isn\'t overwritten.'
      );
    }
  }

  /** What was seen, said as the panel shows it; when it runs by the season's boxes (runs). */
  public static String asShown(
    String key,
    Object said,
    AgentActivityRuns runs
  ) {
    return key == AgentActivityRules.RUNS
      ? runs.asShown(said)
      : AgentActivityRules.asShown(key, said);
  }

  /** What the change says of when it runs and who leads it: nothing of one not asked. */
  public static List<String> saidOf(
    AgentActivityRuns runs,
    AgentActivityLeaders leaders
  ) {
    List<String> result = new List<String>();
    if (leaders != null) {
      result.add(leaders.saidAsked());
    }
    if (runs != null) {
      result.add('when it runs ' + runs.said(runs.asked));
    }
    return result;
  }

  /** Whether a change asks for any field the rules' save takes (who can do it and the rules). */
  public static Boolean asksRules(Map<String, Object> given) {
    for (String key : rulesAndWho()) {
      if (given.containsKey(key)) {
        return true;
      }
    }
    return false;
  }
}
