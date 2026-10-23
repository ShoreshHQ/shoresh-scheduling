/**
 * Where an elective set sits on a schedule (electives slice E7; repo ADR 0018 choice 30; plan §2
 * "Where electives happen"): its elective times (ElectivePeriod), worked out from the schedule's
 * days each time they are needed, never stored. One time per day, time block and division, as the
 * desktop's deriveOccurrences.js makes them: the bunks of one division holding the set in one
 * block share its seats. Also the fingerprint of where it sits (ElectiveRun__c.TimesFingerprint__c),
 * so a change to the schedule after seats were assigned is noticed, and which of the set's
 * offerings each time offers.
 *
 * Reads nothing itself: the caller hands in the days (ScheduleDays.read), the program's groups
 * and the set's offerings with who can take them, so a request reads each once.
 */
public with sharing class ElectiveTimes {
  public static final String ELECTIVE = 'E';

  public List<ElectivePeriod> periods = new List<ElectivePeriod>();
  // Every cell holding the set, "2027-07-06|<block>|<group>", sorted: what the fingerprint hashes.
  public List<String> cells = new List<String>();
  // Days that could not be read ("Tuesday: it was saved by a newer version of Shoresh").
  public List<String> unreadable = new List<String>();
  private String setId;
  private Map<Id, Group__c> groups;
  private Map<String, ElectivePeriod> periodsByKey = new Map<String, ElectivePeriod>();
  // day|block -> the times there, in division order.
  private Map<String, List<ElectivePeriod>> bySlot = new Map<String, List<ElectivePeriod>>();
  // The day being read.
  private Date day;
  private ScheduleGrid grid;

  /**
   * The set's times on these days. programGroups: the program's groups with Division__c and
   * Division__r.SortOrder__c; a bunk not among them (another program's, or deleted) is left out.
   */
  public ElectiveTimes(
    List<ScheduleDays.DayGrid> days,
    Id electiveSetId,
    Map<Id, Group__c> programGroups
  ) {
    setId = String.valueOf(electiveSetId);
    groups = programGroups;
    for (ScheduleDays.DayGrid each : days) {
      if (each.grid == null) {
        unreadable.add(
          Datetime.newInstance(each.day, Time.newInstance(12, 0, 0, 0))
              .format('EEEE') +
            ': ' +
            each.problem
        );
        continue;
      }
      day = each.day;
      grid = each.grid;
      readDay();
    }
    periods.sort(new PeriodOrder());
    cells.sort();
    for (ElectivePeriod each : periods) {
      String slot = slotOf(each.day, each.blockId);
      if (!bySlot.containsKey(slot)) {
        bySlot.put(slot, new List<ElectivePeriod>());
      }
      bySlot.get(slot).add(each);
    }
  }

  private void readDay() {
    for (Integer g = 0; g < grid.groups.size(); g++) {
      Group__c grp = groupOf(grid.groups[g].id);
      if (grp == null) {
        continue;
      }
      for (Integer b = 0; b < grid.blocks.size(); b++) {
        ScheduleGrid.Item item = GridItems.itemAt(grid, g, b);
        if (item != null && item.kind == ELECTIVE && item.id == setId) {
          cells.add(
            String.valueOf(day) + '|' + grid.blocks[b].id + '|' + grp.Id
          );
          periodFor(b, grp).groupIds.add(grp.Id);
        }
      }
    }
  }

  private Group__c groupOf(String text) {
    return GridItems.isId(text) ? groups.get(Id.valueOf(text)) : null;
  }

  private ElectivePeriod periodFor(Integer b, Group__c grp) {
    ScheduleGrid.Block block = grid.blocks[b];
    String key = keyOf(day, block.id, grp.Division__c);
    ElectivePeriod found = periodsByKey.get(key);
    if (found == null) {
      found = new ElectivePeriod();
      found.key = key;
      found.day = day;
      found.blockId = block.id;
      found.blockName = block.name;
      found.startTime = block.startTime;
      found.blockOrder = b;
      found.divisionId = grp.Division__c;
      Decimal order = grp.Division__r?.SortOrder__c;
      found.divisionOrder = order == null ? 0 : order.intValue();
      periodsByKey.put(key, found);
      periods.add(found);
    }
    return found;
  }

  /** "2027-07-06|<block>|<division>": an elective time's key, in the browser too. */
  public static String keyOf(Date onDay, String blockId, Id divisionId) {
    return String.valueOf(onDay) + '|' + blockId + '|' + divisionId;
  }

  /** "2027-07-06|<block>": a seat's place in the week (one seat per camper there). */
  public static String slotOf(Date onDay, String blockId) {
    return String.valueOf(onDay) + '|' + blockId;
  }

  /** A SHA-256 of where the set sits: the same cells give the same text. */
  public String fingerprint() {
    return EncodingUtil.convertToHex(
      Crypto.generateDigest('SHA-256', Blob.valueOf(String.join(cells, '\n')))
    );
  }

  public ElectivePeriod periodAt(String key) {
    return periodsByKey.get(key);
  }

  /**
   * The time a camper takes at a day and block: their bunk's division's, when their bunk holds
   * the set there; with no bunk, the first division's there (division order), as the screen
   * shows them under "No Bunk". Null when they have none there.
   */
  public ElectivePeriod periodOf(Id groupId, Date onDay, String blockId) {
    List<ElectivePeriod> here = bySlot.get(slotOf(onDay, blockId));
    if (here == null) {
      return null;
    }
    if (groupId == null) {
      return here[0];
    }
    for (ElectivePeriod each : here) {
      if (each.groupIds.contains(groupId)) {
        return each;
      }
    }
    return null;
  }

  /**
   * Each time's offerings: the set's confirmed ones (Proposed__c false) whose activity is open to
   * it. offerings: in the order the screen lists them (by activity name).
   */
  public void offer(List<Offering__c> offerings, ElectiveOpenness openness) {
    for (ElectivePeriod each : periods) {
      for (Offering__c offering : offerings) {
        if (
          offering.Proposed__c != true &&
          openness.openAt(offering.Activity__c, each)
        ) {
          each.offeringIds.add(offering.Id);
        }
      }
    }
  }

  /** By day, then block order, then division order, then division Id: the order of the week. */
  private class PeriodOrder implements System.Comparator<ElectivePeriod> {
    public Integer compare(ElectivePeriod a, ElectivePeriod b) {
      if (a.day != b.day) {
        return a.day < b.day ? -1 : 1;
      }
      if (a.blockOrder != b.blockOrder) {
        return a.blockOrder < b.blockOrder ? -1 : 1;
      }
      if (a.divisionOrder != b.divisionOrder) {
        return a.divisionOrder < b.divisionOrder ? -1 : 1;
      }
      return String.valueOf(a.divisionId)
        .compareTo(String.valueOf(b.divisionId));
    }
  }
}
