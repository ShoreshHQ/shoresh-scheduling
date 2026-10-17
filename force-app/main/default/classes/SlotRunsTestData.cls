/**
 * Runs for Manual Build's slot-save tests, as the screen sends them: each names its time blocks
 * (blockIds), from its first block on in the program's order, unless a test sets them itself.
 */
@IsTest
public class SlotRunsTestData {
  private static List<Id> blocks = new List<Id>();

  /** The program's time blocks, in order. */
  public static void useBlocks(List<Id> ordered) {
    blocks = ordered;
  }

  /** Where a run starts: a day, a group, and its first time block. */
  public static SlotEdits.Run at(
    Date day,
    String groupId,
    String firstBlockId
  ) {
    SlotEdits.Run run = new SlotEdits.Run();
    run.day = day;
    run.groupId = groupId;
    run.firstBlockId = firstBlockId;
    return run;
  }

  /** An edit of one run, with what its slots held and should hold. */
  public static SlotEdits.Edit edit(
    SlotEdits.Run run,
    List<String> before,
    List<String> after
  ) {
    run.before = before;
    run.after = after;
    if (run.blockIds == null) {
      run.blockIds = blocksFrom(run.firstBlockId, after.size());
    }
    SlotEdits.Edit edit = new SlotEdits.Edit();
    edit.runs = new List<SlotEdits.Run>{ run };
    return edit;
  }

  private static List<String> blocksFrom(String firstBlockId, Integer count) {
    List<String> ids = new List<String>();
    Integer first = blocks.indexOf(Id.valueOf(firstBlockId));
    for (
      Integer i = first; i >= 0 && i < first + count && i < blocks.size(); i++
    ) {
      ids.add(blocks[i]);
    }
    return ids;
  }
}
