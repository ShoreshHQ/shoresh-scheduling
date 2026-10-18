/**
 * What Generated Schedule sends to save a generated week (GeneratedSaves) and gets back. The
 * whole week goes at once: every day of the draft, as the engine built it.
 */
public with sharing class GeneratedWeek {
  public class Save {
    @AuraEnabled
    public Id programId { get; set; }
    @AuraEnabled
    public Id weekId { get; set; }
    // The Generated draft the week was read from, or null when there was none yet.
    @AuraEnabled
    public Id scheduleId { get; set; }
    // GeneratedInputs.Inputs.revision as it was read: empty when there was no draft.
    @AuraEnabled
    public String revision { get; set; }
    // Generate, Rebuild, TryAnother, FillOpen or StartOver (GeneratedSaves).
    @AuraEnabled
    public String action { get; set; }
    // The option the engine built it with: 1, 2, ...
    @AuraEnabled
    public Integer option { get; set; }
    @AuraEnabled
    public List<Day> days { get; set; }
  }

  /**
   * One day as the engine built it. Its time blocks and groups are named so the server can check
   * they are the day's own; its items and rows are the compact grid's (ADR 0005 §6).
   */
  public class Day {
    @AuraEnabled
    public Date dateValue { get; set; }
    @AuraEnabled
    public List<String> blockIds { get; set; }
    @AuraEnabled
    public List<String> groupIds { get; set; }
    @AuraEnabled
    public List<Item> items { get; set; }
    @AuraEnabled
    public List<String> rows { get; set; }
  }

  public class Item {
    @AuraEnabled
    public String kind { get; set; }
    @AuraEnabled
    public String id { get; set; }
    @AuraEnabled
    public String name { get; set; }
  }

  public class Result {
    // True when someone else saved this week's Generated Schedule since it was read: nothing was
    // written, and message says so.
    @AuraEnabled
    public Boolean conflict = false;
    @AuraEnabled
    public String message;
    // After a save: the draft, and what its days are saved at now (for the next save).
    @AuraEnabled
    public Id scheduleId;
    @AuraEnabled
    public String revision;
    // The version saved first (Rebuild, Start over), or null.
    @AuraEnabled
    public Id versionId;
  }
}
