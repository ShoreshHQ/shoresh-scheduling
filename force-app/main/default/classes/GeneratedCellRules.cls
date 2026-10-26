/**
 * What the engine may never build, as a generated week's save checks it (GeneratedChecks): fixed
 * and recurring activities stay where they are, and nothing goes where a group isn't at camp (a
 * morning-only group's afternoon). A hand edit is never held to these (SlotSaves; Greg,
 * 2026-10-26). On setup already read (GeneratedSetup), in user mode.
 */
public with sharing class GeneratedCellRules {
  private CampLabels labels;
  private Map<Id, Group__c> groups;
  private Map<Id, TimeBlock__c> blocks;

  public GeneratedCellRules(GeneratedSetup setup) {
    labels = setup.labels();
    groups = new Map<Id, Group__c>(setup.groups);
    blocks = new Map<Id, TimeBlock__c>(setup.blocks);
  }

  /** Fixed and recurring activities stay where setup put them. */
  public void checkNotSetTime(String was, String slot) {
    if (SlotIds.isSetTime(was) || SlotIds.isSetTime(slot)) {
      throw new ShoreshException(
        labels.plural('FixedActivity') +
          ' and ' +
          labels.pluralInSentence('RecurringActivity') +
          ' stay where they are set up.'
      );
    }
  }

  /** Nothing goes where a group isn't at camp (at: the group's and time block's Ids). */
  public void checkAtCamp(String slot, List<String> at) {
    if (String.isEmpty(slot)) {
      return;
    }
    Group__c grp = groups.get(Id.valueOf(at[0]));
    TimeBlock__c block = blocks.get(Id.valueOf(at[1]));
    if (grp != null && block != null && !SetTimePlan.atCamp(grp, block)) {
      throw new ShoreshException(
        grp.Name + ' isn\'t at camp in ' + block.Name + '.'
      );
    }
  }
}
