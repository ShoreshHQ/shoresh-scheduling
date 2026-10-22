/**
 * What an import does to a special day's or event's frame (ADR 0014 choice 17): the file's time
 * blocks (and an event's stations) replace the plan's, so every change is named, never made
 * quietly. A time block with the same name and times is kept; one at the same times under
 * another name is renamed; the rest are removed or added. An event's stations are matched by
 * name. Whether the director changed the frame (an event's is always the director's; a special
 * day's once it differs from the time blocks it would start with) decides whether the import
 * asks before it renames or removes any of it. Only that question reads anything (one query,
 * SpecialDaySeed.startingBlocks).
 */
public with sharing class SpecialImportFrame {
  /** A time block the file calls something else. */
  public class BlockRename {
    @AuraEnabled
    public String was;
    @AuraEnabled
    public String now;

    public BlockRename(String was, String now) {
      this.was = was;
      this.now = now;
    }
  }

  /** Every change the import makes to the frame, in the plan's order then the file's. */
  public class FrameChanges {
    @AuraEnabled
    public List<BlockRename> renamed = new List<BlockRename>();
    @AuraEnabled
    public List<String> removed = new List<String>();
    @AuraEnabled
    public List<String> added = new List<String>();
    @AuraEnabled
    public List<String> stationsRemoved = new List<String>();
    @AuraEnabled
    public List<String> stationsAdded = new List<String>();

    /** Whether the import takes away or renames something the plan has. */
    public Boolean losesAny() {
      return !renamed.isEmpty() ||
        !removed.isEmpty() ||
        !stationsRemoved.isEmpty();
    }
  }

  /** From the item's frame (before; null: nothing saved) to the one the import saves. */
  public static FrameChanges between(
    SpecialSchedule.Owner owner,
    ScheduleGrid before,
    ScheduleGrid after
  ) {
    FrameChanges changes = new FrameChanges();
    compareBlocks(
      before == null ? new List<ScheduleGrid.Block>() : before.blocks,
      after.blocks,
      changes
    );
    if (owner.isEvent()) {
      List<String> wasNames = namesOf(
        before == null ? new List<ScheduleGrid.GroupRef>() : before.groups
      );
      List<String> nowNames = namesOf(after.groups);
      changes.stationsRemoved = notIn(wasNames, nowNames);
      changes.stationsAdded = notIn(nowNames, wasNames);
    }
    return changes;
  }

  /**
   * Whether the import asks first: it renames or removes part of a frame the director changed.
   * An event's frame is all theirs; a special day's is changed once its time blocks are not the
   * ones it starts with, name and times, in order.
   */
  public static Boolean asksFirst(
    SpecialSchedule.Owner owner,
    ScheduleGrid before,
    FrameChanges changes
  ) {
    if (before == null || !changes.losesAny()) {
      return false;
    }
    if (owner.isEvent()) {
      return true;
    }
    return !keysOf(before.blocks)
      .equals(keysOf(SpecialDaySeed.startingBlocks(owner.seasonId)));
  }

  private static void compareBlocks(
    List<ScheduleGrid.Block> was,
    List<ScheduleGrid.Block> now,
    FrameChanges changes
  ) {
    BlockMatch match = new BlockMatch();
    // The same name and times: kept. Then the same times under another name: renamed.
    match.pair(keysOf(was), keysOf(now));
    Map<Integer, Integer> renamedTo = match.pair(timesOf(was), timesOf(now));
    for (Integer w = 0; w < was.size(); w++) {
      if (renamedTo.containsKey(w)) {
        changes.renamed.add(
          new BlockRename(was[w].name, now[renamedTo.get(w)].name)
        );
      } else if (!match.pairedWas.contains(w)) {
        changes.removed.add(was[w].name);
      }
    }
    for (Integer n = 0; n < now.size(); n++) {
      if (!match.pairedNow.contains(n)) {
        changes.added.add(now[n].name);
      }
    }
  }

  /** Pairs blocks before and after by key, each at most once, first come first paired. */
  private class BlockMatch {
    final Set<Integer> pairedWas = new Set<Integer>();
    final Set<Integer> pairedNow = new Set<Integer>();

    /** Each unpaired one before with the first unpaired one after of the same key. */
    Map<Integer, Integer> pair(List<String> wasKeys, List<String> nowKeys) {
      Map<Integer, Integer> result = new Map<Integer, Integer>();
      for (Integer w = 0; w < wasKeys.size(); w++) {
        Integer n = pairedWas.contains(w) ? null : freeAt(wasKeys[w], nowKeys);
        if (n != null) {
          pairedWas.add(w);
          pairedNow.add(n);
          result.put(w, n);
        }
      }
      return result;
    }

    private Integer freeAt(String key, List<String> nowKeys) {
      for (Integer n = 0; n < nowKeys.size(); n++) {
        if (!pairedNow.contains(n) && key.equals(nowKeys[n])) {
          return n;
        }
      }
      return null;
    }
  }

  /** "09:00|09:45" for each block. */
  private static List<String> timesOf(List<ScheduleGrid.Block> blocks) {
    List<String> result = new List<String>();
    for (ScheduleGrid.Block block : blocks) {
      result.add(block.startTime + '|' + block.endTime);
    }
    return result;
  }

  /** "Lunch|12:00|12:45" for each block. */
  private static List<String> keysOf(List<ScheduleGrid.Block> blocks) {
    List<String> result = timesOf(blocks);
    for (Integer b = 0; b < blocks.size(); b++) {
      result[b] = blocks[b].name + '|' + result[b];
    }
    return result;
  }

  private static List<String> namesOf(List<ScheduleGrid.GroupRef> refs) {
    List<String> names = new List<String>();
    for (ScheduleGrid.GroupRef ref : refs) {
      names.add(ref.name);
    }
    return names;
  }

  /** Names of these not among those (exactly), each once, in order. */
  private static List<String> notIn(List<String> these, List<String> those) {
    Set<String> others = new Set<String>(those);
    List<String> result = new List<String>();
    for (String name : these) {
      if (!others.contains(name) && !result.contains(name)) {
        result.add(name);
      }
    }
    return result;
  }
}
