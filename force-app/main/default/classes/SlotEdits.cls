/**
 * What Manual Build sends to save (SlotSaves) and gets back: edits, each a list of runs of slots
 * with what they held and what they should hold, and the schedule as it is after them.
 */
public with sharing class SlotEdits {
  /** One edit: its runs are made together or not at all. */
  public class Edit {
    @AuraEnabled
    public List<Run> runs { get; set; }
    // A rainy day only (repo docs/adr/0019): the "Rain plan full" marks each day it names keeps
    // once the edit is made (none takes them away, as Undo does). Left out, a day keeps its own.
    @AuraEnabled
    public List<RainDay> rain { get; set; }
  }

  /** The "Rain plan full" marks a day keeps (RainMarks: "group Id|time block Id|activity Id"). */
  public class RainDay {
    @AuraEnabled
    public Date day { get; set; }
    @AuraEnabled
    public List<String> cells { get; set; }
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
    // Each slot's time block, from the week the screen made the run on: the run is made only on
    // those blocks, so a block added among them since is a conflict, not a shifted placement.
    // Required.
    @AuraEnabled
    public List<String> blockIds { get; set; }
    // Generated Schedule only: each cell's lock as the screen saw it ('1' locked, '' not). A run
    // whose cells are locked otherwise now is a conflict, so no one's Lock goes unseen.
    @AuraEnabled
    public List<String> locksBefore { get; set; }
    // Generated Schedule only, for an Undo or Redo: each cell's lock to leave (the step's own
    // locks taken back or made again, a Lock set or removed since kept). Left out, what the run
    // changes is locked when filled.
    @AuraEnabled
    public List<String> locksAfter { get; set; }

    /** Whether it is well formed and inside a day of that many time blocks. */
    public Boolean fits(Integer first, Integer blockCount) {
      return first >= 0 &&
        before != null &&
        after != null &&
        !before.isEmpty() &&
        before.size() == after.size() &&
        first + before.size() <= blockCount;
    }

    /** Whether the day's blocks from first are the ones it was made on. */
    public Boolean onBlocks(List<String> dayBlockIds, Integer first) {
      if (blockIds == null || blockIds.isEmpty()) {
        // Every run names its blocks: one that doesn't wasn't sent by the screen as it is now.
        throw new ShoreshException(
          'That change could not be read. Reload the page and try again.'
        );
      }
      return blockIds.size() == after.size() &&
        SlotIds.sameBlocks(dayBlockIds, first, blockIds);
    }
  }

  public class Result {
    // The edits not made because someone changed their slots since (their positions in the list).
    @AuraEnabled
    public List<Integer> conflicts = new List<Integer>();
    // The schedule as it is now, everyone's changes included.
    @AuraEnabled
    public ScheduleViews.ScheduleView schedule;
    // Generated Schedule only: what the days are saved at now, for its next whole-week save; none
    // when someone else saved the week since the screen read it (it reads the week again).
    @AuraEnabled
    public String revision;
  }
}
