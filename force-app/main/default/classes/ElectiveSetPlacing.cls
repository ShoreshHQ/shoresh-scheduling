/**
 * An elective set placed in a fresh week's day at its time (repo ADR 0027; ELECT-7.1, 7.4, 7.5):
 * over its blocks, for the groups it is for (ElectiveSetWho), as one set cell, as a director
 * would type it. A group takes the blocks it is at camp for, from the first, unbroken, only when
 * all of them are free; otherwise it is named in the day's notPlaced.
 */
public with sharing class ElectiveSetPlacing {
  // One set being placed in one day: its blocks, the day's index of the first, and its item's
  // position once it has a cell.
  private BlankDay day;
  private ElectiveSet__c electiveSet;
  private List<TimeBlock__c> span;
  private Integer firstBlock;
  private String position;

  /**
   * The blocks a set's time takes, from its block to its last block (a later block of the same
   * program); its block alone when it has no last block, or none after it.
   */
  public static List<TimeBlock__c> spanOf(
    List<TimeBlock__c> blocks,
    TimeBlock__c block,
    ElectiveSet__c electiveSet
  ) {
    List<TimeBlock__c> span = new List<TimeBlock__c>{ block };
    Id lastId = lastOf(electiveSet);
    if (lastId == null || lastId == block.Id) {
      return span;
    }
    Integer first = blocks.indexOf(block);
    if (first < 0) {
      return span;
    }
    List<TimeBlock__c> after = new List<TimeBlock__c>();
    for (Integer i = first + 1; i < blocks.size(); i++) {
      after.add(blocks[i]);
      if (blocks[i].Id == lastId) {
        span.addAll(after);
        break;
      }
    }
    return span;
  }

  /** Its last block, when it was read with it; none otherwise (ELECT-7.5). */
  private static Id lastOf(ElectiveSet__c electiveSet) {
    try {
      return electiveSet.LastTimeBlock__c;
    } catch (SObjectException e) {
      return null;
    }
  }

  /** The set over its blocks (span), for each group of the day it is for. */
  public static void place(
    BlankDay day,
    ElectiveSet__c electiveSet,
    List<TimeBlock__c> span
  ) {
    Integer b = span[0] == null ? null : day.blockAt(span[0].Id);
    if (b == null) {
      return;
    }
    ElectiveSetPlacing placing = new ElectiveSetPlacing(day, electiveSet, span);
    placing.firstBlock = b;
    for (ScheduleGrid.GroupRef ref : day.grid.groups) {
      Group__c grp = day.groupOf(ref.id);
      if (grp != null && ElectiveSetWho.isFor(electiveSet.Id, grp)) {
        placing.placeFor(grp);
      }
    }
  }

  private ElectiveSetPlacing(
    BlankDay day,
    ElectiveSet__c electiveSet,
    List<TimeBlock__c> span
  ) {
    this.day = day;
    this.electiveSet = electiveSet;
    this.span = span;
  }

  /**
   * One group: the part of the span it is at camp for (a morning-only or afternoon-only group, a
   * double period across midday takes the part it is there for, as BlankDay.atCampPart does).
   */
  private void placeFor(Group__c grp) {
    List<Integer> part = atCampPart(grp, span);
    if (part.isEmpty()) {
      return;
    }
    Integer first = firstBlock + part[0];
    List<String> row = day.rowOf(grp.Id);
    if (!free(row, first, part.size())) {
      day.notPlaced.add(electiveSet.Name + ' · ' + grp.Name);
      return;
    }
    if (position == null) {
      day.grid.items.add(
        new ScheduleGrid.Item('E', electiveSet.Id, electiveSet.Name)
      );
      position = String.valueOf(day.grid.items.size());
    }
    row[first] = position;
    for (Integer i = first + 1; i < first + part.size(); i++) {
      row[i] = ScheduleGrid.CARRIES_ON;
    }
  }

  /**
   * The span's blocks the group is at camp for (their places in it): from the first such block,
   * unbroken, as BlankDay.atCampPart.
   */
  private static List<Integer> atCampPart(
    Group__c grp,
    List<TimeBlock__c> span
  ) {
    List<Integer> part = new List<Integer>();
    for (Integer i = 0; i < span.size(); i++) {
      if (SetTimePlan.atCamp(grp, span[i])) {
        part.add(i);
      } else if (!part.isEmpty()) {
        break;
      }
    }
    return part;
  }

  private static Boolean free(List<String> row, Integer first, Integer length) {
    for (Integer i = first; i < first + length; i++) {
      if (i >= row.size() || String.isNotBlank(row[i])) {
        return false;
      }
    }
    return true;
  }
}
