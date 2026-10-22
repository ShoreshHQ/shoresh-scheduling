/** The setup screens' "Looks right" on something an import guessed (ADR 0006 §21). */
public with sharing class SetupGuessesController {
  /** The camp forgets the guess, and the setup screen no longer marks it. */
  @AuraEnabled
  public static void confirmGuess(Id recordId, String field) {
    try {
      SetupGuessConfirm.confirm(recordId, field);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }
}
