/**
 * Server side of Bring in choices (electives slice E6; repo ADR 0017): the screen's start, the
 * check before saving, and the save. The sheet is read in the browser and sent as the director
 * confirmed it (JSON, ChoicesImport.Request); the file never leaves the browser. In user mode.
 */
public with sharing class ChoicesImportController {
  /** The season's elective sets and runs, and the camp's remembered answers about names. */
  @AuraEnabled
  public static ChoicesImport.Situation choicesSetup(Id seasonId) {
    try {
      return ChoicesImport.situation(seasonId);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** What bringing the sheet in would do: campers known and new, hand changes kept. Saves nothing. */
  @AuraEnabled
  public static ChoicesImport.Check checkChoices(String request) {
    try {
      return ChoicesImport.check(parse(request));
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** Brings the sheet in: the campers, the committed run and their choices, all or nothing. */
  @AuraEnabled
  public static ChoicesImport.Done bringInChoices(String request) {
    try {
      return ChoicesImport.bringIn(parse(request));
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  private static ChoicesImport.Request parse(String request) {
    try {
      return (ChoicesImport.Request) JSON.deserialize(
        request,
        ChoicesImport.Request.class
      );
    } catch (Exception e) {
      throw new ShoreshException(
        'The sheet could not be sent. Choose the file again.'
      );
    }
  }
}
