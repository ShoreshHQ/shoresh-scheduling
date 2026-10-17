/**
 * What Manual Build sends to save (SlotSaves) and gets back: edits, each a list of runs of slots
 * with what they held and what they should hold, and the schedule as it is after them.
 */
public with sharing class SlotEdits {
  /** One edit: its runs are made together or not at all. */
  public class Edit {
    @AuraEnabled
    public List<Run> runs { get; set; }
  }

  /** Slots next to each other in one group's day: what they held, and what they should hold. */
  public class Run {
    @AuraEnabled
    public Date day { get; set; }
    @AuraEnabled
    public String groupId { get; set; }
    @AuraEnabled
    public String firstBlockId { get; set; }
    @AuraEnabled
    public List<String> before { get; set; }
    @AuraEnabled
    public List<String> after { get; set; }

    /** Whether it is well formed and inside a day of that many time blocks. */
    public Boolean fits(Integer first, Integer blockCount) {
      return first >= 0 &&
        before != null &&
        after != null &&
        !before.isEmpty() &&
        before.size() == after.size() &&
        first + before.size() <= blockCount;
    }
  }

  public class Result {
    // The edits not made because someone changed their slots since (their positions in the list).
    @AuraEnabled
    public List<Integer> conflicts = new List<Integer>();
    // The schedule as it is now, everyone's changes included.
    @AuraEnabled
    public ScheduleViews.ScheduleView schedule;
  }
}
