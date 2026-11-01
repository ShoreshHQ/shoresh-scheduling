/**
 * A setup field's time as a camp types it (docs/protocol/api.md API-1.49): 9:00, 9:00 AM, 9am,
 * 14:30. One that doesn't read is refused saying how to give it.
 */
public with sharing class AgentSetupTimes {
  // Hours, then minutes if any, then am or pm if any.
  private static final Pattern TYPED = Pattern.compile(
    '^(\\d{1,2})(?::(\\d{2}))?(am|pm)?$'
  );

  /** A time as camps type it: 9:00, 9:00 AM, 9am, 14:30. */
  public static Time timeOf(String key, String asked) {
    Time read = read(asked.toLowerCase().replace(' ', '').replace('.', ''));
    if (read == null) {
      throw new ShoreshException(
        'Give the ' + key.replace('_', ' ') + ' as a time like 9:00 AM.'
      );
    }
    return read;
  }

  /** The time typed, or null when it doesn't read as one. */
  private static Time read(String text) {
    Matcher parts = TYPED.matcher(text);
    if (!parts.matches()) {
      return null;
    }
    Integer hour = Integer.valueOf(parts.group(1));
    Integer minute = parts.group(2) == null
      ? 0
      : Integer.valueOf(parts.group(2));
    String half = parts.group(3);
    if (half != null) {
      // 12 am is midnight, 12 pm noon; 13 pm doesn't read.
      hour = hour >= 1 && hour <= 12 ? Math.mod(hour, 12) : 99;
      hour += half == 'pm' ? 12 : 0;
    }
    return hour <= 23 &&
      minute <= 59
      ? Time.newInstance(hour, minute, 0, 0)
      : null;
  }
}
