/**
 * Server side of Generated Schedule (ADR 0010): what the engine needs to build a program's week,
 * and saving the week it built. Anyone with the Shoresh Scheduler permission set can generate
 * (Greg, 2026-10-17). Every query runs in user mode and every write uses user-mode DML.
 */
public with sharing class GeneratedScheduleController {
  @AuraEnabled
  public static GeneratedInputs.Inputs getInputs(Id programId, Id weekId) {
    try {
      return GeneratedInputs.read(programId, weekId);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** Saves the whole week, or answers with a conflict when someone else saved it since. */
  @AuraEnabled
  public static GeneratedWeek.Result saveWeek(GeneratedWeek.Save request) {
    try {
      return GeneratedSaves.save(request);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }
}
