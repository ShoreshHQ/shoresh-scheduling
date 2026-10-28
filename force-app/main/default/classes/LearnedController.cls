/**
 * The "What Shoresh has learned" screen's server side (c/shoreshLearned, repo ADR 0021): read
 * the camp's remembered answers, and change, forget or (Undo) remember again one at a time;
 * forget a pattern.
 */
public with sharing class LearnedController {
  @AuraEnabled
  public static List<LearnedAnswers.Learned> getLearned(Id campId) {
    try {
      return LearnedAnswers.forCamp(campId);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** The new record's Id, or null when the answer is no longer there (the screen shows the latest). */
  @AuraEnabled
  public static Id changeLearned(Id campId, Id answerId, String answer) {
    try {
      return LearnedAnswers.change(campId, answerId, answer);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** False when it was already gone. */
  @AuraEnabled
  public static Boolean forgetLearned(Id campId, Id answerId) {
    try {
      return LearnedAnswers.forget(campId, answerId);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** Undo of a Forget. False when it can't come back: the screen shows the latest. */
  @AuraEnabled
  public static Boolean restoreLearned(Id campId, Id answerId) {
    try {
      return LearnedUndo.forget(campId, answerId);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** Undo of a Change: newId is what the Change saved, oldId what it replaced. */
  @AuraEnabled
  public static Boolean undoChangeLearned(Id campId, Id newId, Id oldId) {
    try {
      return LearnedUndo.change(campId, newId, oldId);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /**
   * Forget a pattern: its answers stay. The new marker's Id, then the one it replaced if any
   * (Undo: forgetLearned on the new one, or undoChangeLearned with both).
   */
  @AuraEnabled
  public static List<Id> forgetLearnedPattern(
    Id campId,
    String template,
    String antecedent
  ) {
    try {
      return LearnedAnswers.forgetPattern(campId, template, antecedent);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }
}
