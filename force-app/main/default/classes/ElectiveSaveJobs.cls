/**
 * The background jobs of large camps' saves (ElectiveBigSave; repo ADR 0018 choice 59), as a run
 * is read: a save whose job Salesforce has already ended is shown stopped, never "still saving"
 * for ever, and a season's Clear in parts is found among its runs.
 */
public with sharing class ElectiveSaveJobs {
  // Salesforce's own word for a background job that is over, however it ended.
  private static final Set<String> JOB_OVER = new Set<String>{
    'Completed',
    'Failed',
    'Aborted'
  };
  private static final String ENDED = 'Salesforce stopped it before the end.';

  /**
   * Runs read as saving whose background job Salesforce has already ended (cancelled in Setup, or
   * stopped by a limit before it could say so): shown as stopped (SaveProblem__c, in memory), so
   * the run is never "still saving" for ever and the next save goes ahead and clears it. A run is
   * read again first, so a save that just finished is never taken for one that stopped.
   */
  public static void settle(List<ElectiveRun__c> runs) {
    Set<String> jobIds = new Set<String>();
    for (ElectiveRun__c run : runs) {
      if (isSaving(run) && run.SaveJob__c != null) {
        jobIds.add(run.SaveJob__c);
      }
    }
    Set<String> over = jobsOver(jobIds);
    if (over.isEmpty()) {
      return;
    }
    Map<Id, ElectiveRun__c> now = new Map<Id, ElectiveRun__c>(
      [
        SELECT Id, SaveTotal__c, SaveProblem__c, SaveJob__c
        FROM ElectiveRun__c
        WHERE SaveJob__c IN :over
        WITH USER_MODE
      ]
    );
    for (ElectiveRun__c run : runs) {
      ElectiveRun__c fresh = now.get(run.Id);
      if (fresh != null && isSaving(fresh) && over.contains(fresh.SaveJob__c)) {
        run.SaveProblem__c = ENDED;
      }
    }
  }

  /** Of these jobs, the ones Salesforce has ended. */
  private static Set<String> jobsOver(Set<String> jobIds) {
    Set<String> over = new Set<String>();
    if (jobIds.isEmpty()) {
      return over;
    }
    // System mode: a job's status only, by the Id this save kept; AsyncApexJob has no user-mode
    // access a scheduler is granted.
    for (AsyncApexJob job : [
      SELECT Id, Status
      FROM AsyncApexJob
      WHERE Id IN :jobIds
      WITH SYSTEM_MODE
    ]) {
      if (JOB_OVER.contains(job.Status)) {
        over.add(String.valueOf(job.Id).left(18));
      }
    }
    return over;
  }

  private static Boolean isSaving(ElectiveRun__c run) {
    return run.SaveTotal__c != null && run.SaveProblem__c == null;
  }

  /**
   * The season's Clear in parts, under way or stopped (null when none): every run it clears
   * carries the same count. Only Clear saves a final run in parts; a committed run's is its own
   * Assign or Finalize.
   */
  public static ElectiveRun__c clearing(List<ElectiveRun__c> runs) {
    for (ElectiveRun__c run : runs) {
      if (
        run.SaveTotal__c != null &&
        run.Status__c != ElectiveClear.COMMITTED
      ) {
        return run;
      }
    }
    return null;
  }
}
