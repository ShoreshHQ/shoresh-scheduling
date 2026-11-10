/**
 * The elective sets a special day's own schedule's edits place (SPECIAL-1.3; repo ADR 0026): the
 * season's, read once through SlotEvents as Manual Build reads them. An event's columns are
 * stations, with no campers to seat, so a set is refused there with nothing saved.
 */
public with sharing class SpecialScheduleSets {
  /** The season's elective sets the edits place; none read when they place none. */
  public static SlotEvents read(
    SpecialSchedule.Owner owner,
    CampLabels labels,
    List<SlotEdits.Edit> edits
  ) {
    Boolean placesSet = false;
    for (SlotEdits.Edit edit : edits) {
      for (SlotEdits.Run run : edit.runs) {
        for (String slot : run.after ?? new List<String>()) {
          placesSet = placesSet || SlotIds.electiveIn(slot) != null;
        }
      }
    }
    if (!placesSet) {
      return SlotEvents.none();
    }
    if (owner.isEvent()) {
      // No article built from a camp word (design guide): the camp's plurals.
      throw new ShoreshException(
        AgentRefusal.withFix(
          owner.name +
            '\'s columns are stations, not ' +
            labels.pluralInSentence('Group') +
            ', so it can\'t hold ' +
            labels.pluralInSentence('ElectiveSet') +
            '.',
          'Put them in ' +
            labels.pluralInSentence('SpecialDay') +
            ', where the columns are ' +
            labels.pluralInSentence('Group') +
            '.'
        )
      );
    }
    SlotRules.Setup setup = new SlotRules.Setup();
    setup.seasonId = owner.seasonId;
    setup.labels = labels;
    return SlotEvents.read(setup, edits, new Map<Id, SObject>());
  }
}
