/**
 * CORE-3.9 for an AI (docs/protocol/api.md API-1.147): a fixed activity added or changed over a
 * recurring activity asks what Camp Setup's Fixed activities table asks, and on the yes sends the
 * same pieces. A faithful port of the screen's own working (lwc/shoreshProgram/fixedOver.js), read
 * from the records the screen reads (SeasonSetupReader's programs, the season's weeks and week-off
 * marks), so the same setup gives the same question and the same pieces. Change both together:
 * both must pass the shared examples (staticresources/ShoreshFixedOverExamples.json).
 * The fixed activity as it would be saved: AgentFixedOverPlan; the recurring activities it lands
 * on and the pieces each keeps: AgentFixedOverLandings; the question: AgentFixedOverWords.
 */
public with sharing class AgentFixedOver {
  private static final List<Schema.SObjectField> WHERE_IT_SITS = new List<Schema.SObjectField>{
    FixedActivity__c.TimeBlock__c,
    FixedActivity__c.Length__c,
    FixedActivity__c.EarlyDay__c,
    FixedActivity__c.EarlyBlocks__c
  };

  /** The screen's question, its one line, and the pieces each recurring activity keeps. */
  public class Ask {
    public String heading;
    public String line;
    public List<SetTimeAround.Piece> around = new List<SetTimeAround.Piece>();

    /** What the person is asked: the screen's question and its line. */
    public String words() {
      return heading + ' ' + line;
    }
  }

  /**
   * As fixedOver: null when the record isn't a fixed activity, lands on no recurring activity, or
   * one sits only in its blocks and can't go around it (the save then refuses, as on screen).
   */
  public static Ask of(
    SObject record,
    ScreenSaves.Extras extras,
    AgentSetupRecords.Found found
  ) {
    if (
      !(record instanceof FixedActivity__c) || !movesOrComesBack(record, extras)
    ) {
      return null;
    }
    AgentFixedOverPlan plan = AgentFixedOverPlan.read(record, extras, found);
    if (plan == null) {
      return null;
    }
    List<AgentFixedOverLandings.Landing> clashing = AgentFixedOverLandings.of(
      plan
    );
    return clashing == null || clashing.isEmpty()
      ? null
      : AgentFixedOverWords.of(clashing, plan, found.labels);
  }

  /** A new fixed activity, or one whose blocks change or that comes back on in a week. */
  private static Boolean movesOrComesBack(
    SObject record,
    ScreenSaves.Extras extras
  ) {
    if (record.Id == null) {
      return true;
    }
    for (Schema.SObjectField field : WHERE_IT_SITS) {
      if (record.isSet(field)) {
        return true;
      }
    }
    return extras != null &&
      extras.weeksBackOn != null &&
      !extras.weeksBackOn.isEmpty();
  }
}
