/**
 * A special event that stays placed on the week while its own schedule is built or removed after
 * publishing (ADR 0014 slice 5, choice 27): Publish carries only an event with a schedule of its
 * own, so such an event is carried on one side only, and neither the week's cells nor
 * SpecialChanges (which compares an event carried on both sides) see it. Said as an event change,
 * "Color War: schedule added" or "Color War: schedule removed". An event placed or taken off with
 * its schedule is a change of the week's cells, said there.
 */
public with sharing class EventScheduleChanges {
  /** One side of the comparison: what it carries, and its days. */
  public class Side {
    private List<ScheduleSpecials.Special> specials;
    private List<ScheduleDays.DayGrid> days;

    public Side(
      List<ScheduleSpecials.Special> specials,
      List<ScheduleDays.DayGrid> days
    ) {
      this.specials = specials;
      this.days = days;
    }
  }

  /** Adds each event whose schedule was added or removed from was (published) to now. */
  public static void add(PublishedChanges.Changes changes, Side was, Side now) {
    for (String name : carriedOnlyIn(now, was)) {
      changes.addEvent(name + ': schedule added');
    }
    for (String name : carriedOnlyIn(was, now)) {
      changes.addEvent(name + ': schedule removed');
    }
  }

  /** The names of the events side carries that other doesn't, though other has them placed. */
  private static List<String> carriedOnlyIn(Side side, Side other) {
    List<String> result = new List<String>();
    Set<String> carriedByOther = new Set<String>();
    for (ScheduleSpecials.Special special : other.specials) {
      carriedByOther.add(special.key());
    }
    Set<String> placedInOther;
    for (ScheduleSpecials.Special special : side.specials) {
      if (
        special.kind != ScheduleSpecials.EVENT ||
        carriedByOther.contains(special.key())
      ) {
        continue;
      }
      placedInOther = placedInOther ?? placed(other);
      if (placedInOther.contains(special.itemId)) {
        result.add(special.name);
      }
    }
    return result;
  }

  /** The events (Ids as text) placed on the side's days its special days don't replace. */
  private static Set<String> placed(Side side) {
    Set<String> result = new Set<String>();
    Set<Date> replaced = ScheduleSpecials.replacedDates(
      side.specials,
      new List<ScheduleSpecials.Special>()
    );
    for (Id eventId : SpecialsNow.eventsOn(side.days, replaced).keySet()) {
      result.add(String.valueOf(eventId));
    }
    return result;
  }
}
