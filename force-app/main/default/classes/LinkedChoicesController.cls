/**
 * Server side of the linked choices editor beside the Electives list (electives slice E8; repo ADR
 * 0018 choices 38 to 44): where the set sits in the week, and one gesture saved. A change comes
 * as JSON (as Elective seats' requests do), read into LinkedChoiceSaves.Edit. Deleting a linked
 * choice is SeasonSetupController.deleteRecord, as every setup delete.
 */
public with sharing class LinkedChoicesController {
  /** Where the set sits on the season's working schedules: the editor's small week. */
  @AuraEnabled
  public static LinkedChoicePlaces.Places linkedChoicePlaces(Id electiveSetId) {
    try {
      return LinkedChoicePlaces.of(electiveSetId);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** One gesture: a linked choice made, renamed, its periods, who it applies to. */
  @AuraEnabled
  public static Id saveLinkedChoice(String edit) {
    try {
      return LinkedChoiceSaves.save(parse(edit));
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  private static LinkedChoiceSaves.Edit parse(String edit) {
    try {
      return (LinkedChoiceSaves.Edit) JSON.deserialize(
        edit,
        LinkedChoiceSaves.Edit.class
      );
    } catch (Exception e) {
      throw new ShoreshException('That change could not be sent. Try again.');
    }
  }
}
