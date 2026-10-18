/**
 * What Generated Schedule sends to save a generated week (GeneratedSaves) and gets back. The
 * whole week goes at once: every day of the draft, as the engine built it.
 */
public with sharing class GeneratedWeek {
  // What a LockChange does.
  public static final String LOCK = 'Lock';
  public static final String UNLOCK = 'Unlock';

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

    /** Refuses a save the screen could not have sent, or an option that can't be built. */
    public void check(Set<String> actions) {
      if (days == null || !actions.contains(action)) {
        throw GeneratedFrames.unreadable();
      }
      GeneratedFrames.checkSent(days);
      // EngineOption__c holds four digits.
      if (option == null || option < 1 || option > 9999) {
        throw new ShoreshException('That option can\'t be built.');
      }
    }
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
    // The version saved first (Rebuild, Try another, Start over), or null.
    @AuraEnabled
    public Id versionId;
    // The locked cells after the save: the stored ones, kept; none after Start over.
    @AuraEnabled
    public List<Cell> locks = new List<Cell>();
  }

  /**
   * Lock or unlock: one cell (dateValue, groupId and blockId), or the shortcuts a whole day
   * (dateValue only) or a whole group (groupId only, or with dateValue for its day).
   */
  public class LockChange {
    @AuraEnabled
    public Date dateValue { get; set; }
    @AuraEnabled
    public String groupId { get; set; }
    @AuraEnabled
    public String blockId { get; set; }
    // LOCK or UNLOCK.
    @AuraEnabled
    public String action { get; set; }

    public Boolean locks() {
      return LOCK.equals(action);
    }
  }

  /** The week after a lock change, and what its days are saved at now; or a conflict. */
  public class Locked {
    // True when someone else saved the week since the screen read it: nothing was changed.
    @AuraEnabled
    public Boolean conflict = false;
    @AuraEnabled
    public String message;
    @AuraEnabled
    public ScheduleViews.ScheduleView schedule;
    @AuraEnabled
    public String revision;
  }

  /** A cell of the week: a day, a group and a time block. */
  public class Cell {
    @AuraEnabled
    public Date dateValue;
    @AuraEnabled
    public String groupId;
    @AuraEnabled
    public String blockId;
  }
}
