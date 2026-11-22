/**
 * Finalize's names at a large camp, written in the background (ElectiveGivenRows; repo ADR 0018
 * choice 59); the last part makes the run Final. Stopped, the version kept for it goes again, so
 * no "finalized" version stands for a run that isn't.
 */
public with sharing class ElectiveFinalizeRows extends ElectiveGivenRows {
  private Id versionId;

  public ElectiveFinalizeRows(
    Id runId,
    List<Assignment__c> named,
    Id versionId
  ) {
    super(runId);
    updates = named;
    this.versionId = versionId;
  }

  /** What makes a run Final, with the version of its schedule kept for it. */
  public static ElectiveRun__c finalFields(Id versionId) {
    return new ElectiveRun__c(
      Status__c = ElectiveRunState.FINAL_STATUS,
      FinalizedAt__c = System.now(),
      FinalizedBy__c = UserInfo.getUserId(),
      FinalSchedule__c = versionId
    );
  }

  public override void finish() {
    finishRun(finalFields(versionId));
  }

  public override void stopped() {
    Database.delete(new Schedule__c(Id = versionId), AccessLevel.USER_MODE);
  }
}
