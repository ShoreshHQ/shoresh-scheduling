/**
 * A camp's remembered guesses (SetupGuesses, ADR 0006 §21), and those still standing on the
 * records a setup screen shows: the value saved then is the value now, on a record that was
 * there when it was guessed. One query.
 */
public with sharing class SetupGuessStanding {
  public final List<SetupGuesses.Guess> result = new List<SetupGuesses.Guess>();
  private final Map<String, ImportAnswer__c> guessed = new Map<String, ImportAnswer__c>();

  public SetupGuessStanding(Id campId) {
    for (ImportAnswer__c row : [
      SELECT QuestionKey__c, Answer__c, LastModifiedDate
      FROM ImportAnswer__c
      WHERE Camp__c = :campId
      WITH USER_MODE
      ORDER BY CreatedDate
      LIMIT 5000
    ]) {
      if (
        row.QuestionKey__c != null &&
        row.QuestionKey__c.startsWith(SetupGuessValues.PREFIX)
      ) {
        guessed.put(row.QuestionKey__c, row);
      }
    }
  }

  public Boolean isEmpty() {
    return guessed.isEmpty();
  }

  /** Each field of the item (field -> its value now) still as guessed, on a record made by then. */
  public void check(
    SObject record,
    String item,
    Map<String, String> valuesNow
  ) {
    for (String field : valuesNow.keySet()) {
      ImportAnswer__c row = guessed.get(SetupGuessValues.question(item, field));
      String now = valuesNow.get(field);
      if (
        row == null ||
        !now.equals(row.Answer__c) ||
        (Datetime) record.get('CreatedDate') > row.LastModifiedDate
      ) {
        continue;
      }
      SetupGuesses.Guess guess = new SetupGuesses.Guess();
      guess.recordId = record.Id;
      guess.field = field;
      guess.value = field == SetupGuessValues.DIVISION ? now : null;
      result.add(guess);
    }
  }
}
