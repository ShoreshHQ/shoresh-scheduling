/**
 * The "What Shoresh has learned" screen's server side (c/shoreshLearned, repo ADR 0021): read
 * the camp's remembered answers, and change, forget or (Undo) remember again one at a time.
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

  /** False when the answer is no longer there: the screen shows the latest. */
  @AuraEnabled
  public static Boolean changeLearned(Id campId, Id answerId, String answer) {
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

  /** Undo of a Forget. False when the answer is nowhere to be found. */
  @AuraEnabled
  public static Boolean restoreLearned(Id campId, Id answerId) {
    try {
      return LearnedAnswers.restore(campId, answerId);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }
}
