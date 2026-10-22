/**
 * Times of a special day's or event's own time blocks (ADR 0014 choice 16): "HH:mm", as the
 * compact grid stores them (ScheduleGridFrameRules), and a block with no name called by its times,
 * as setup's time blocks are (TimeBlockTriggerHandler).
 */
public with sharing class SpecialPlanClock {
  private static final Pattern CLOCK = Pattern.compile(
    '([01][0-9]|2[0-3]):[0-5][0-9]'
  );

  /** "9:05", "09:05" or a time field's "09:05:00.000" as "09:05"; null when it isn't a time. */
  public static String of(String value) {
    String text = value == null ? '' : value.trim();
    if (text.length() >= 8 && text.substring(5, 6) == ':') {
      text = text.substring(0, 5);
    }
    if (text.length() == 4 && text.substring(1, 2) == ':') {
      text = '0' + text;
    }
    return CLOCK.matcher(text).matches() ? text : null;
  }

  /**
   * The block with a change's name and times (end after start); with no name it is called by
   * its times.
   */
  public static ScheduleGrid.Block timed(
    ScheduleGrid.Block block,
    SpecialScheduleFrame.Change change
  ) {
    String startTime = of(change.startTime);
    String endTime = of(change.endTime);
    if (startTime == null || endTime == null) {
      throw new ShoreshException('Give it a start and an end time.');
    }
    if (endTime <= startTime) {
      throw new ShoreshException('The end time must be after the start time.');
    }
    block.startTime = startTime;
    block.endTime = endTime;
    String name = change.name == null ? '' : change.name.normalizeSpace();
    block.name = name == ''
      ? rangeName(startTime, endTime)
      : SpecialActivities.checkedName(name);
    return block;
  }

  /** "9:00 AM – 9:45 AM", for "09:00" and "09:45". */
  public static String rangeName(String startTime, String endTime) {
    return TimeBlockTriggerHandler.rangeLabel(
      timeOf(startTime),
      timeOf(endTime)
    );
  }

  private static Time timeOf(String hhmm) {
    return Time.newInstance(
      Integer.valueOf(hhmm.substring(0, 2)),
      Integer.valueOf(hhmm.substring(3, 5)),
      0,
      0
    );
  }
}
