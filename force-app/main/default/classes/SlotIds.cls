/**
 * What a slot of a Manual Build grid holds, written as its identity: '' (Open), the item starting
 * there ('A:<activity Id>'; kind and record Id, or kind and name for things not set up in Shoresh
 * yet), or '^' and the identity of the item carrying on into it ('^A:<activity Id>'). Names never
 * decide a match. Used by SlotSaves to compare what a slot holds with what the director saw.
 */
public with sharing class SlotIds {
  public static final String OPEN = '';

  /** The identity of each slot in a group's row. */
  public static List<String> ofRow(ScheduleGrid grid, Integer g) {
    List<String> result = new List<String>();
    String carrying = OPEN;
    for (String token : grid.rows[g]) {
      if (token == ScheduleGrid.CARRIES_ON) {
        result.add(ScheduleGrid.CARRIES_ON + carrying);
      } else {
        carrying = String.isBlank(token)
          ? OPEN
          : of(grid.items[Integer.valueOf(token) - 1]);
        result.add(carrying);
      }
    }
    return result;
  }

  public static String of(ScheduleGrid.Item item) {
    if (!ScheduleGridRules.isSetUp(item)) {
      return item.kind + ':' + item.name;
    }
    try {
      return item.kind + ':' + String.valueOf(Id.valueOf(item.id));
    } catch (StringException e) {
      return item.kind + ':' + item.id;
    }
  }

  /** The item a slot belongs to, whether it starts there or carries on into it. */
  public static String owner(String slot) {
    return isCarryOn(slot) ? slot.substring(1) : slot;
  }

  public static Boolean isCarryOn(String slot) {
    return slot.startsWith(ScheduleGrid.CARRIES_ON);
  }

  /** A fixed or recurring activity, starting in the slot or carrying on into it. */
  public static Boolean isSetTime(String slot) {
    String item = owner(slot);
    return item.startsWith('F:') || item.startsWith('R:');
  }

  /** The activity a slot's identity starts, or null. */
  public static Id activityIn(String slot) {
    if (slot == null || !slot.startsWith('A:')) {
      return null;
    }
    try {
      return Id.valueOf(slot.substring(2));
    } catch (StringException e) {
      return null;
    }
  }

  /** The special event a slot's identity starts ('S:<Id>'), or null (one not set up yet). */
  public static Id eventIn(String slot) {
    return recordIn(slot, 'S:', SpecialEvent__c.SObjectType);
  }

  /** The elective set a slot's identity starts ('E:<Id>', ADR 0018 slice E5), or null (one not set up yet). */
  public static Id electiveIn(String slot) {
    return recordIn(slot, 'E:', ElectiveSet__c.SObjectType);
  }

  /** The record of a type a slot's identity starts after its kind, or null. */
  private static Id recordIn(
    String slot,
    String kind,
    Schema.SObjectType type
  ) {
    if (slot == null || !slot.startsWith(kind)) {
      return null;
    }
    try {
      Id recordId = Id.valueOf(slot.substring(kind.length()));
      return recordId.getSObjectType() == type ? recordId : null;
    } catch (StringException e) {
      return null;
    }
  }

  /** The same identity however the screen wrote the record Id (15 or 18 characters). */
  public static String normal(String slot) {
    if (String.isBlank(slot)) {
      return OPEN;
    }
    String carry = isCarryOn(slot) ? ScheduleGrid.CARRIES_ON : '';
    String item = slot.substring(carry.length());
    String kind = item.substringBefore(':');
    if (ScheduleGridRules.SET_UP_LATER_KINDS.contains(kind)) {
      // A special event or day, or an elective set, by its record (written either length), or
      // one not set up yet by name (a name is never a record Id).
      try {
        return carry +
          kind +
          ':' +
          String.valueOf(Id.valueOf(item.substringAfter(':')));
      } catch (Exception e) {
        return carry + item;
      }
    }
    if (!ScheduleGridRules.SET_UP_KINDS.contains(kind)) {
      return carry + item;
    }
    try {
      return carry +
        kind +
        ':' +
        String.valueOf(Id.valueOf(item.substringAfter(':')));
    } catch (StringException e) {
      throw new ShoreshException('That change could not be read.');
    }
  }

  /** The position of a group or time block by record Id, or -1. */
  public static Integer indexOf(List<String> ids, String wanted) {
    for (Integer i = 0; i < ids.size(); i++) {
      if (sameId(ids[i], wanted)) {
        return i;
      }
    }
    return -1;
  }

  /** Whether a day's time blocks from first are the wanted ones, in order. */
  public static Boolean sameBlocks(
    List<String> dayIds,
    Integer first,
    List<String> wanted
  ) {
    if (first + wanted.size() > dayIds.size()) {
      return false;
    }
    for (Integer i = 0; i < wanted.size(); i++) {
      if (!sameId(dayIds[first + i], wanted[i])) {
        return false;
      }
    }
    return true;
  }

  private static Boolean sameId(String a, String b) {
    try {
      return Id.valueOf(a) == Id.valueOf(b);
    } catch (Exception e) {
      return false;
    }
  }
}
