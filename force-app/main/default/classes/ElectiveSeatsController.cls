/**
 * Server side of Elective seats (electives slice E7; repo ADR 0018 choices 28 to 37): the season's
 * runs, one run as the screen shows it, Assign seats, a seat by hand, Finalize and Start a new
 * version. Each save sends back the run as it now is. In user mode; requests come as JSON (as
 * Bring in choices sends its own), read into ElectiveSeatSaves' classes.
 */
public with sharing class ElectiveSeatsController {
  /** The season's elective runs. */
  @AuraEnabled
  public static ElectiveSeats.Situation seatsSetup(Id seasonId) {
    try {
      return ElectiveSeats.situation(seasonId);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** One run: where the set sits, its offerings, campers, choices and seats. */
  @AuraEnabled
  public static ElectiveSeats.RunView openRun(Id runId) {
    try {
      return ElectiveSeats.open(runId);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** Assign seats (and Assign again): the engine's seats, checked, in place of the unlocked ones. */
  @AuraEnabled
  public static ElectiveSeats.RunView assignSeats(String request) {
    try {
      return ElectiveSeatSaves.assign(
        (ElectiveSeatSaves.AssignRequest) parse(
          request,
          ElectiveSeatSaves.AssignRequest.class
        )
      );
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** One seat moved, locked or unlocked by hand. */
  @AuraEnabled
  public static ElectiveSeats.RunView changeSeat(String request) {
    try {
      return ElectiveSeatChange.change(
        (ElectiveSeatChange.ChangeRequest) parse(
          request,
          ElectiveSeatChange.ChangeRequest.class
        )
      );
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** Finalize: the week's seats fixed, or refused with the reason. */
  @AuraEnabled
  public static ElectiveSeats.RunView finalizeRun(Id runId, Decimal revision) {
    try {
      return ElectiveFinalize.finalizeRun(runId, revision);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** Start a new version of a final run, with its choices, locks and hand moves. */
  @AuraEnabled
  public static ElectiveSeats.RunView startNewVersion(Id runId) {
    try {
      return ElectiveFinalize.startNewVersion(runId);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** A final run and its bunks' week, for the downloads (refused before Finalize). */
  @AuraEnabled
  public static ElectiveDownloads.Download runDownload(Id runId) {
    try {
      return ElectiveDownloads.forRun(runId);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** The season's elective runs, choices, seats and campers week by week, and what stays. */
  @AuraEnabled
  public static ElectiveClear.Picture clearPicture(Id seasonId) {
    try {
      return ElectiveClear.picture(seasonId);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** End-of-season Clear: the whole season or one week, exactly as the picture showed. */
  @AuraEnabled
  public static ElectiveClear.Result clearElectives(String request) {
    try {
      return ElectiveClear.clear(
        (ElectiveClear.ClearRequest) parse(
          request,
          ElectiveClear.ClearRequest.class
        )
      );
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  private static Object parse(String request, System.Type kind) {
    try {
      return JSON.deserialize(request, kind);
    } catch (Exception e) {
      throw new ShoreshException('The seats could not be sent. Try again.');
    }
  }
}
