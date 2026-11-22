/**
 * "Which camper is row 7?" (ELECT-2.7, Greg 2026-11-21): for each choices-sheet row whose name
 * more than one camper in the season has (or that the director called a different camper while
 * one of that name is here), the season's campers of that name, each labelled so the director
 * can tell them apart: their bunk from their latest choices, and the order they were added when
 * the labels still read the same. Read in user mode; one query, only when there is a question.
 */
public with sharing class ChoicesWhichCamper {
  /**
   * "Which camper is row 7?" for each row it is asked of, answered or not (so an answer can be
   * changed): the season's campers of its name, each with
   * their bunk (from their latest choices) so the director can tell them apart, and the order
   * they were added when that is all there is. One query, only when there is a question.
   */
  public static List<ChoicesImport.Which> questions(
    ChoicesImport.Request request,
    Map<Integer, List<Camper__c>> rows
  ) {
    List<ChoicesImport.Which> result = new List<ChoicesImport.Which>();
    Set<Id> asked = new Set<Id>();
    for (List<Camper__c> candidates : rows.values()) {
      for (Camper__c candidate : candidates) {
        asked.add(candidate.Id);
      }
    }
    if (asked.isEmpty()) {
      return result;
    }
    Map<Id, String> bunkOf = new Map<Id, String>();
    for (Preference__c had : [
      SELECT Camper__c, Group__r.Name
      FROM Preference__c
      WHERE Camper__c IN :asked AND Group__c != NULL
      WITH USER_MODE
      ORDER BY ElectiveRun__r.CreatedDate DESC, Id DESC
    ]) {
      if (!bunkOf.containsKey(had.Camper__c)) {
        bunkOf.put(had.Camper__c, had.Group__r.Name);
      }
    }
    List<Integer> indexes = new List<Integer>(rows.keySet());
    indexes.sort();
    for (Integer i : indexes) {
      ChoicesImport.Which which = new ChoicesImport.Which();
      which.index = i;
      which.row = request.campers[i].row;
      which.choices = picks(rows.get(i), bunkOf);
      result.add(which);
    }
    return result;
  }

  /**
   * "Ari Green, Oak"; two that read the same (capitals and spacing aside, as the name key) are
   * told apart by when each was added ("added second").
   */
  private static List<ChoicesImport.Pick> picks(
    List<Camper__c> found,
    Map<Id, String> bunkOf
  ) {
    Map<String, Integer> seen = new Map<String, Integer>();
    List<String> labels = new List<String>();
    for (Camper__c candidate : found) {
      String label = candidate.Name.normalizeSpace();
      if (bunkOf.containsKey(candidate.Id)) {
        label += ', ' + bunkOf.get(candidate.Id);
      }
      labels.add(label);
      String same = label.toLowerCase();
      seen.put(same, seen.containsKey(same) ? seen.get(same) + 1 : 1);
    }
    List<ChoicesImport.Pick> result = new List<ChoicesImport.Pick>();
    Map<String, Integer> count = new Map<String, Integer>();
    for (Integer i = 0; i < found.size(); i++) {
      String label = labels[i];
      String same = label.toLowerCase();
      if (seen.get(same) > 1) {
        Integer nth = count.containsKey(same) ? count.get(same) + 1 : 1;
        count.put(same, nth);
        label += ', added ' + ordinalWord(nth);
      }
      ChoicesImport.Pick pick = new ChoicesImport.Pick();
      pick.id = found[i].Id;
      pick.label = label;
      result.add(pick);
    }
    return result;
  }

  private static String ordinalWord(Integer n) {
    List<String> words = new List<String>{
      'first',
      'second',
      'third',
      'fourth',
      'fifth'
    };
    return n <= words.size() ? words[n - 1] : n + 'th';
  }
}
