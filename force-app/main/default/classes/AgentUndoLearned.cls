/** undo_learned_answer: Undo on "What Shoresh has learned", API-1.97 (docs/protocol/api.md). Shared parts: AgentLearned. */
@RestResource(urlMapping='/v1/undo_learned_answer')
global with sharing class AgentUndoLearned implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{ 'season', 'undo' };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentUndoLearned());
  }

  public String run() {
    return undo(AgentFields.body(FIELDS));
  }

  /**
   * The screen's Undo of a Change, Forget or Forget pattern, by the undo its answer gave. As on
   * the screen, only what this person just did: the newest thing that happened to that answer,
   * done by them. Never over a newer answer (LearnedUndo).
   */
  private static String undo(Map<String, Object> body) {
    Id campId = AgentLearned.campOf(body);
    List<String> parts = AgentLearned.raw(body, 'undo').trim().split(':');
    String kind = parts[0];
    List<Id> ids = idsOf(parts);
    if (ids.size() == 2 && kind != 'forget') {
      requireReplaced(campId, ids);
    }
    // A Change or a Forget pattern is undone from what it saved; a Forget from what it forgot.
    String what = kind == 'change'
      ? LearnedEvents.CHANGED
      : LearnedEvents.FORGOTTEN;
    if (!lastByMe(campId, ids[0], what)) {
      throw new AgentWeeks.ConflictException(
        'That can\'t be undone now: someone changed it since, or it wasn\'t you who did it.' +
        AgentLearned.READ_AGAIN
      );
    }
    if (undone(campId, kind, ids) != true) {
      throw AgentLearned.stale();
    }
    return kind == 'change' ? 'Changed back.' : 'Remembered again.';
  }

  /** The undo's Ids: change:<new>:<old>, forget:<id>, pattern:<new>[:<old>]; else refused. */
  private static List<Id> idsOf(List<String> parts) {
    Integer size = parts.size();
    String kind = parts[0];
    Boolean ok =
      (kind == 'change' &&
      size == 3) ||
      (kind == 'forget' &&
      size == 2) ||
      (kind == 'pattern' && (size == 2 || size == 3));
    List<Id> ids = new List<Id>();
    try {
      for (Integer i = 1; ok && i < size; i++) {
        ids.add(Id.valueOf(parts[i]));
      }
    } catch (Exception e) {
      ok = false;
    }
    if (!ok) {
      throw new ShoreshException(
        'Say the undo a change, forget or forget pattern gave (undo), like "forget:a0X...".' +
        AgentLearned.NOTHING
      );
    }
    return ids;
  }

  /** What it saved, locked; and what it replaced, that same question's, in the recycle bin. */
  private static void requireReplaced(Id campId, List<Id> ids) {
    List<ImportAnswer__c> saved = [
      SELECT Key__c
      FROM ImportAnswer__c
      WHERE Id = :ids[0] AND Camp__c = :campId
      WITH USER_MODE
      LIMIT 1
      FOR UPDATE
    ];
    List<ImportAnswer__c> replaced = [
      SELECT Key__c
      FROM ImportAnswer__c
      WHERE Id = :ids[1] AND Camp__c = :campId AND IsDeleted = TRUE
      WITH USER_MODE
      LIMIT 1
      ALL ROWS
    ];
    if (
      saved.isEmpty() ||
      replaced.isEmpty() ||
      !saved[0].Key__c.equals(replaced[0].Key__c)
    ) {
      throw new AgentWeeks.ConflictException(
        'That can\'t be undone now: someone changed it since, or the undo isn\'t the one its answer gave.' +
        AgentLearned.READ_AGAIN
      );
    }
  }

  /** The screen's own Undo for that kind. */
  private static Boolean undone(Id campId, String kind, List<Id> ids) {
    try {
      if (ids.size() == 2) {
        return LearnedController.undoChangeLearned(campId, ids[0], ids[1]);
      }
      if (kind == 'forget') {
        return LearnedController.restoreLearned(campId, ids[0]);
      }
      return LearnedController.forgetLearned(campId, ids[0]);
    } catch (Exception e) {
      throw AgentLearned.refused(e);
    }
  }

  /** The newest thing that happened to this answer is this, done by the person asking. */
  private static Boolean lastByMe(Id campId, Id answerId, String what) {
    String said = String.valueOf(answerId);
    List<LearnedEvent__c> last = [
      SELECT What__c, CreatedById
      FROM LearnedEvent__c
      WHERE Camp__c = :campId AND AnswerId__c = :said
      WITH USER_MODE
      ORDER BY CreatedDate DESC, Id DESC
      LIMIT 1
    ];
    return !last.isEmpty() &&
      last[0].What__c == what &&
      last[0].CreatedById == UserInfo.getUserId();
  }
}
