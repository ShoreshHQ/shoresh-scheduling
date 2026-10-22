/**
 * What an import does to a special day's or event's frame (ADR 0014 choice 17): the file's time
 * blocks (and an event's stations) replace the plan's, so every change is named, never made
 * quietly. A time block with the same name and times is kept; one at the same times under
 * another name is renamed; the rest are removed or added. An event's stations are matched by
 * name. Whether the director changed the frame (an event's is always the director's; a special
 * day's once it differs from the time blocks it would start with) decides whether the screen
 * asks before an import renames or removes any of it. Pure: no queries.
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

  /** From the plan's frame (null: nothing saved) to the one the import saves. */
  public static FrameChanges between(
    ScheduleGrid before,
    ScheduleGrid after,
    Boolean isEvent
  ) {
    FrameChanges changes = new FrameChanges();
    List<ScheduleGrid.Block> was = before == null
      ? new List<ScheduleGrid.Block>()
      : before.blocks;
    compareBlocks(was, after.blocks, changes);
    if (isEvent) {
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
   * Whether the director changed the frame: an event's is all theirs; a special day's once its
   * time blocks are not the ones it starts with (seeded), name and times, in order.
   */
  public static Boolean edited(
    ScheduleGrid before,
    List<ScheduleGrid.Block> seeded,
    Boolean isEvent
  ) {
    if (before == null) {
      return false;
    }
    if (isEvent) {
      return !before.blocks.isEmpty() || !before.groups.isEmpty();
    }
    if (before.blocks.size() != seeded.size()) {
      return true;
    }
    for (Integer b = 0; b < seeded.size(); b++) {
      if (!keyOf(before.blocks[b]).equals(keyOf(seeded[b]))) {
        return true;
      }
    }
    return false;
  }

  private static void compareBlocks(
    List<ScheduleGrid.Block> was,
    List<ScheduleGrid.Block> now,
    FrameChanges changes
  ) {
    Set<Integer> keptWas = new Set<Integer>();
    Set<Integer> keptNow = new Set<Integer>();
    // The same name and times: kept.
    pair(was, now, true, keptWas, keptNow);
    // The same times under another name: renamed.
    Map<Integer, Integer> renamedTo = pair(was, now, false, keptWas, keptNow);
    for (Integer w = 0; w < was.size(); w++) {
      if (renamedTo.containsKey(w)) {
        changes.renamed.add(
          new BlockRename(was[w].name, now[renamedTo.get(w)].name)
        );
      } else if (!keptWas.contains(w)) {
        changes.removed.add(was[w].name);
      }
    }
    for (Integer n = 0; n < now.size(); n++) {
      if (!keptNow.contains(n)) {
        changes.added.add(now[n].name);
      }
    }
  }

  /** Pairs each unpaired block of was with the first unpaired one of now that matches. */
  private static Map<Integer, Integer> pair(
    List<ScheduleGrid.Block> was,
    List<ScheduleGrid.Block> now,
    Boolean byName,
    Set<Integer> keptWas,
    Set<Integer> keptNow
  ) {
    Map<Integer, Integer> result = new Map<Integer, Integer>();
    for (Integer w = 0; w < was.size(); w++) {
      if (keptWas.contains(w)) {
        continue;
      }
      String key = byName ? keyOf(was[w]) : timesOf(was[w]);
      for (Integer n = 0; n < now.size(); n++) {
        if (
          !keptNow.contains(n) &&
          key.equals(byName ? keyOf(now[n]) : timesOf(now[n]))
        ) {
          keptWas.add(w);
          keptNow.add(n);
          result.put(w, n);
          break;
        }
      }
    }
    return result;
  }

  private static String timesOf(ScheduleGrid.Block block) {
    return block.startTime + '|' + block.endTime;
  }

  private static String keyOf(ScheduleGrid.Block block) {
    return block.name + '|' + timesOf(block);
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
