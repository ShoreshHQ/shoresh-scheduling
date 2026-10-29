/**
 * Saves an incoming batch as one import (docs/protocol/api.md API-2.3, 2.5): the rows are written
 * by the import's own writer (ImportWriter, user mode, with what Undo needs) and the batch is
 * recorded as an import of the season (ImportLog.recordIncoming), so Roots shows it and "Undo last
 * import" takes it back. A row the platform refuses becomes that record's problem, in Shoresh's
 * words, and the rest are saved without it. A batch that changes nothing records nothing.
 */
public with sharing class IncomingSave {
  // Kinds in the order they depend on each other.
  private static final List<String> ORDER = new List<String>{
    'Division',
    'Group',
    'Activity',
    'Camper',
    'Preference'
  };
  // What Undo needs must fit in the import's record (Import__c long text fields).
  private static final Integer LOG_LIMIT = 131072;
  // Tries before the batch is refused: a row the platform refuses is left out, then it tries again.
  private static final Integer MOST_TRIES = 5;

  private IncomingBatch batch;

  public IncomingSave(IncomingBatch batch) {
    this.batch = batch;
  }

  public void run() {
    Integer tries = 0;
    while (!tryOnce()) {
      tries++;
      if (tries == MOST_TRIES) {
        throw new IncomingBatch.RefusedException(
          'Too many records in this batch were refused, so nothing was saved. Fix the ones said and send it again.'
        );
      }
    }
    for (IncomingBatch.Staged item : batch.staged) {
      // A record can save more than one row (a camper's bunk in each week): said once.
      batch.say(item.index, IncomingBatch.SAVED, item.saved);
    }
  }

  /** One try; false when a row was refused (it is then left out and said). */
  private Boolean tryOnce() {
    List<IncomingBatch.Staged> attempt = fresh();
    Savepoint before = Database.setSavepoint();
    try {
      ImportWriter writer = new ImportWriter(null);
      write(writer, attempt);
      record(writer);
      return true;
    } catch (UserModeWrites.SaveException e) {
      Database.rollback(before);
      leaveOut(attempt, e);
      return false;
    } catch (Exception e) {
      Database.rollback(before);
      throw e;
    }
  }

  /** A fresh copy of every row: a refused save may leave its rows half-filled. */
  private List<IncomingBatch.Staged> fresh() {
    List<IncomingBatch.Staged> attempt = new List<IncomingBatch.Staged>();
    for (IncomingBatch.Staged item : batch.staged) {
      IncomingBatch.Staged copy = new IncomingBatch.Staged();
      copy.index = item.index;
      copy.saved = item.saved;
      copy.row = item.row.clone(item.row.Id != null, true);
      attempt.add(copy);
    }
    return attempt;
  }

  private void leaveOut(
    List<IncomingBatch.Staged> attempt,
    UserModeWrites.SaveException e
  ) {
    for (Integer i = 0; i < attempt.size(); i++) {
      if (attempt[i].row === e.record) {
        batch.problem(
          attempt[i].index,
          'Not saved: ' + ScreenErrors.of(e).getMessage()
        );
        batch.staged.remove(i);
        return;
      }
    }
    throw new IncomingBatch.RefusedException(
      'Shoresh couldn\'t tell which record failed. Try again.'
    );
  }

  private void write(ImportWriter writer, List<IncomingBatch.Staged> attempt) {
    Map<String, List<SObject>> added = new Map<String, List<SObject>>();
    Map<String, List<SObject>> existing = new Map<String, List<SObject>>();
    for (String term : ORDER) {
      added.put(term, new List<SObject>());
      existing.put(term, new List<SObject>());
    }
    for (IncomingBatch.Staged item : attempt) {
      String term = ImportFields.termOf(item.row.getSObjectType());
      if (item.row.Id == null) {
        added.get(term).add(item.row);
      } else {
        existing.get(term).add(item.row);
      }
    }
    // A bringing-in is how a camper's name and bunk change (API-4.2), only inside this save.
    OutsideOwned.bringingIn = true;
    try {
      for (String term : ORDER) {
        if (!added.get(term).isEmpty() || !existing.get(term).isEmpty()) {
          writer.writeTracked(term, added.get(term), existing.get(term));
        }
      }
    } finally {
      OutsideOwned.bringingIn = false;
    }
  }

  /**
   * The import's own record. Every batch's record keeps its questions, none as [] (how Undo and
   * Roots tell a batch from a file import). A batch that saved nothing records no import of its
   * own: its new questions join the last import when that is a batch too (so a question alone
   * never takes a director's Undo away), and are recorded on their own only when it isn't.
   */
  private void record(ImportWriter writer) {
    if (batch.staged.isEmpty() && batch.questions.isEmpty()) {
      return;
    }
    if (batch.staged.isEmpty() && IncomingQuestions.joinLastBatch(batch)) {
      return;
    }
    Import__c done = new Import__c(
      Season__c = batch.season.Id,
      Created__c = JSON.serialize(writer.created),
      Changed__c = JSON.serialize(writer.changed),
      Open__c = IncomingQuestions.fitting(batch.questions)
    );
    if (
      done.Created__c.length() > LOG_LIMIT ||
      done.Changed__c.length() > LOG_LIMIT
    ) {
      throw new IncomingBatch.RefusedException(
        'This batch is too big to be undone later, so nothing was saved. Send it in smaller batches.'
      );
    }
    List<String> senders = new List<String>(batch.systems);
    senders.sort();
    done.Files__c = (batch.capability.what() +
      ' from ' +
      String.join(senders, ', '))
      .left(255);
    ImportLog.recordIncoming(done);
  }
}
