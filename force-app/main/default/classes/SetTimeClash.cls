/**
 * One clash among a season's fixed and recurring activities, found by SetTimeClashes. Clashes are
 * refused, never just shown (Greg, 2026-10-16); SetTimeMessages words the refusal.
 */
public with sharing class SetTimeClash {
  public enum Kind {
    // It runs past the program's last time block.
    PAST_END,
    // A recurring activity is ticked for a day its program does not run.
    CLOSED_DAY,
    // Two items have the same group in the same time block on the same day in the same week.
    SAME_GROUP,
    // More groups at a location at once than fit there.
    OVER_LOCATION
  }

  public Kind kind;
  public SetTimePlan.Item item;
  public SetTimePlan.Item other;
  // Every item at the location at that time (OVER_LOCATION).
  public List<String> names = new List<String>();
  public String groupName;
  public String blockName;
  public String day;
  // Null when the season has no weeks yet.
  public String weekName;
  public Location__c location;
  public Integer count;

  public SetTimeClash(Kind kind, SetTimePlan.Item item) {
    this.kind = kind;
    this.item = item;
  }
}
