/**
 * A large camp's save whose rows are known before it starts (Assign's difference, Finalize's
 * names), written in the background (ElectiveBigSave; repo ADR 0018 choice 59): deletes (emptied
 * from the Recycle Bin too), then updates, then inserts, each in the order given. The last part
 * sets the run's own fields, the save ended, and moves its revision on.
 */
public abstract with sharing class ElectiveGivenRows extends ElectiveBigSave.Work {
  public List<SObject> updates = new List<SObject>();
  public List<SObject> inserts = new List<SObject>();
  // Only the Ids of the rows deleted are kept between parts.
  private List<Id> deletes = new List<Id>();
  private Integer next = 0;

  protected ElectiveGivenRows(Id runId) {
    runIds.add(runId);
  }

  /** Rows to delete, before the updates and inserts. */
  public void deleting(List<SObject> rows) {
    for (SObject row : rows) {
      deletes.add(row.Id);
    }
  }

  /** Starts the save in the background, with the rows given. */
  public void begin() {
    total = deletes.size() + updates.size() + inserts.size();
    emptiesRecycleBin = !deletes.isEmpty();
    ElectiveBigSave.begin(this);
  }

  public override Integer write(Integer most) {
    Integer upTo = Math.min(next + most, total);
    List<SObject> gone = new List<SObject>();
    List<SObject> changed = new List<SObject>();
    List<SObject> added = new List<SObject>();
    for (Integer i = next; i < upTo; i++) {
      if (i < deletes.size()) {
        gone.add(deletes[i].getSObjectType().newSObject(deletes[i]));
      } else if (i < deletes.size() + updates.size()) {
        changed.add(updates[i - deletes.size()]);
      } else {
        added.add(inserts[i - deletes.size() - updates.size()].clone(false));
      }
    }
    ElectiveSeatSaves.deleteForGood(gone);
    Database.update(changed, true, AccessLevel.USER_MODE);
    Database.insert(added, true, AccessLevel.USER_MODE);
    Integer wrote = upTo - next;
    next = upTo;
    return wrote;
  }

  /** The run's own fields once every row is written: the save ended, its revision moved on. */
  protected void finishRun(ElectiveRun__c changes) {
    Decimal revision = [
      SELECT Revision__c
      FROM ElectiveRun__c
      WHERE Id = :runIds[0]
      WITH USER_MODE
    ]
    .Revision__c;
    changes.Id = runIds[0];
    ElectiveBigSave.endOn(changes, revision);
  }
}
