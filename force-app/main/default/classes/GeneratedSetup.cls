/**
 * The program's setup for one week, read once per request and shared by everything Generated
 * Schedule does in it (GeneratedInputs, GeneratedSaves, GeneratedChecks, GeneratedClosures,
 * GeneratedSetupChanges, and BlankWeek for a blank week): the program and week, the time blocks,
 * every group, and this week's exceptions. A save reads it only once it holds its lock. Reading it once keeps a request to a
 * fixed, small number of queries, whatever the size of the week. Runs in user mode.
 */
public with sharing class GeneratedSetup {
  public Program__c program;
  public Week__c week;
  public List<TimeBlock__c> blocks;
  // Every group of the program, those away this week included.
  public List<Group__c> groups;
  public List<WeekException__c> exceptions;
  private CampLabels wordsRead;
  private List<Activity__c> activitiesRead;

  public GeneratedSetup(Id programId, Id weekId) {
    program = ProgramReads.programOf(programId);
    week = ProgramReads.weekOf(weekId, program);
    blocks = ProgramReads.blocksOf(program.Id);
    groups = ProgramReads.groupsOf(program.Id);
    exceptions = [
      SELECT
        Id,
        Week__c,
        Activity__c,
        Location__c,
        Location__r.Name,
        Group__c,
        Group__r.Name,
        FixedActivity__c,
        RecurringActivity__c
      FROM WeekException__c
      WHERE Week__c = :week.Id
      WITH USER_MODE
      ORDER BY Id
    ];
  }

  /** The season's activities as setup reads them (SeasonSetupReader), read when first needed. */
  public List<Activity__c> activityRecords() {
    if (activitiesRead == null) {
      activitiesRead = SeasonSetupReader.activitiesOf(program.Season__c);
    }
    return activitiesRead;
  }

  /** The camp's words, read when first needed. */
  public CampLabels labels() {
    if (wordsRead == null) {
      wordsRead = CampLabels.forCamp(program.Season__r.Camp__c);
    }
    return wordsRead;
  }

  /** The groups away this week (a week exception on the group). */
  public Set<Id> away() {
    Set<Id> result = new Set<Id>();
    for (WeekException__c mark : exceptions) {
      if (mark.Group__c != null) {
        result.add(mark.Group__c);
      }
    }
    return result;
  }

  /** The program's groups in order, without those away this week (ProgramReads.groupsAtCamp). */
  public List<Group__c> atCamp() {
    Set<Id> awayIds = away();
    List<Group__c> result = new List<Group__c>();
    for (Group__c grp : groups) {
      if (!awayIds.contains(grp.Id)) {
        result.add(grp);
      }
    }
    return result;
  }

  /** Start a blank week (BlankWeek), on what is already read. */
  public BlankWeek.Week blankWeek() {
    return BlankWeek.build(this);
  }

  /** Manual Build's rules for the cells (SlotRules), with the activities placed. */
  public SlotRules rules(Set<Id> activityIds) {
    SlotRules.Setup setup = new SlotRules.Setup();
    setup.seasonId = program.Season__c;
    setup.labels = labels();
    setup.groups = groups;
    setup.blocks = blocks;
    return new SlotRules(setup, activityIds);
  }
}
