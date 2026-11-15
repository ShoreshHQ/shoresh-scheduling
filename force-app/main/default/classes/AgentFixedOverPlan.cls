/**
 * For AgentFixedOver (API-1.147): a fixed activity as it would be saved, as fixedOver.js reads it.
 * Its program's entry as Camp Setup reads it (SeasonSetupReader), where it sits (the value being
 * saved, else the one saved), and the weeks it runs in (AgentFixedOverWeeks).
 */
public with sharing class AgentFixedOverPlan {
  public SeasonSetupReader.ProgramSetup entry;
  public List<TimeBlock__c> blocks;
  public AgentFixedOverWeeks weeks;
  public String fixedName;
  public Integer start;
  public Integer length;
  public String earlyDay;
  public Integer earlyBlocks;

  /** The plan; null when its program or time block isn't one the screen shows. */
  public static AgentFixedOverPlan read(
    SObject record,
    ScreenSaves.Extras extras,
    AgentSetupRecords.Found found
  ) {
    SeasonSetupReader.ProgramSetup entry = entryOf(
      found.seasonId,
      found.programId
    );
    if (entry == null) {
      return null;
    }
    AgentFixedOverPlan plan = new AgentFixedOverPlan();
    plan.entry = entry;
    plan.blocks = entry.timeBlocks;
    plan.place(record, savedOf(entry, record.Id));
    if (plan.start < 0) {
      return null;
    }
    plan.weeks = new AgentFixedOverWeeks(found.seasonId, record.Id, extras);
    return plan;
  }

  /** Whether its program runs on a day ("Monday"). */
  public Boolean runs(String day) {
    return entry.program.get(
        SetTimePlan.dayField(Program__c.SObjectType, day)
      ) == true;
  }

  /** Whether it holds block b on a day: on its early day, from earlier (CORE-3.7). */
  public Boolean holds(String day, Integer b) {
    Integer fromBlock = day == earlyDay
      ? Math.max(0, start - earlyBlocks)
      : start;
    return runs(day) && b >= fromBlock && b < start + length;
  }

  /** A time block's place in the day; -1 when it isn't one of the program's. */
  public Integer indexOf(Id blockId) {
    for (Integer i = 0; i < blocks.size(); i++) {
      if (blockId != null && blocks[i].Id == blockId) {
        return i;
      }
    }
    return -1;
  }

  /** A whole number, or the default for none or 0 (the screen's "|| 1"). */
  public static Integer wholeOr(Object value, Integer otherwise) {
    Integer whole = value == null ? 0 : ((Decimal) value).intValue();
    return whole == 0 ? otherwise : whole;
  }

  /** Where it sits, from the record being saved over the one saved. */
  private void place(SObject record, FixedActivity__c saved) {
    start = indexOf((Id) valueOf(record, saved, FixedActivity__c.TimeBlock__c));
    length = wholeOr(valueOf(record, saved, FixedActivity__c.Length__c), 1);
    earlyDay = (String) valueOf(record, saved, FixedActivity__c.EarlyDay__c);
    earlyBlocks = wholeOr(
      valueOf(record, saved, FixedActivity__c.EarlyBlocks__c),
      0
    );
    fixedName = (String) valueOf(record, saved, FixedActivity__c.Name);
  }

  /** The program's entry as Camp Setup reads it. */
  private static SeasonSetupReader.ProgramSetup entryOf(
    Id seasonId,
    Id programId
  ) {
    for (
      SeasonSetupReader.ProgramSetup each : SeasonSetupReader.readPrograms(
        seasonId
      )
    ) {
      if (each.program.Id == programId) {
        return each;
      }
    }
    return null;
  }

  /** The fixed activity as the screen has it saved; null for a new one. */
  private static FixedActivity__c savedOf(
    SeasonSetupReader.ProgramSetup entry,
    Id recordId
  ) {
    for (FixedActivity__c each : entry.fixedActivities) {
      if (recordId != null && each.Id == recordId) {
        return each;
      }
    }
    return null;
  }

  /** The value being saved, else the one saved. */
  private static Object valueOf(
    SObject record,
    FixedActivity__c saved,
    Schema.SObjectField field
  ) {
    if (record.isSet(field)) {
      return record.get(field);
    }
    return saved == null ? null : saved.get(field);
  }
}
