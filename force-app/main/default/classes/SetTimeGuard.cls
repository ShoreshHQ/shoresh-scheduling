/**
 * Refuses any change that would make fixed or recurring activities clash (Greg, 2026-10-16:
 * clashes "must not be allowed"), whichever side it comes from: the items themselves, who they
 * cover, their weeks, a location's groups that fit, time blocks, groups, a program's days, or a
 * new week. Triggers on those objects report what changed here, by the season, program,
 * division, or week it belongs to.
 *
 * A change made through Salesforce directly is checked as soon as it is saved. A screen save that
 * writes several records in steps (rows, then week ticks, then who) defers the check to the end,
 * so a half-done save is never judged: defer(), then checkPending() once everything is written,
 * and always resume() (in a finally block).
 */
public with sharing class SetTimeGuard {
  private static Integer depth = 0;
  private static Set<Id> pendingOwners = new Set<Id>();
  private static SetTimeMessages.Side pendingSide = SetTimeMessages.Side.ITEM;
  // Seasons found to have no fixed or recurring activities in this transaction: nothing there
  // can clash, so they are not read again until an item is saved.
  private static Set<Id> withoutItems = new Set<Id>();

  public static void defer() {
    depth++;
  }

  public static void resume() {
    depth = Math.max(0, depth - 1);
    if (depth == 0) {
      pendingOwners = new Set<Id>();
      pendingSide = SetTimeMessages.Side.ITEM;
    }
  }

  /** Throws the refusal if what was saved since defer() clashes. */
  public static void checkPending() {
    Set<Id> owners = pendingOwners;
    SetTimeMessages.Side side = pendingSide;
    pendingOwners = new Set<Id>();
    String problem = firstProblem(seasonsOf(owners), side);
    if (problem != null) {
      throw new ShoreshException(problem);
    }
  }

  /** A fixed or recurring activity was saved: its season has items now. */
  public static void itemsSaved() {
    withoutItems = new Set<Id>();
  }

  /**
   * Called by triggers: the seasons, programs, divisions, or weeks whose records just changed, and
   * which records to refuse.
   */
  public static void changed(
    Set<Id> owners,
    List<SObject> records,
    SetTimeMessages.Side side
  ) {
    owners.remove(null);
    if (owners.isEmpty()) {
      return;
    }
    if (depth > 0) {
      pendingOwners.addAll(owners);
      if (side != SetTimeMessages.Side.ITEM) {
        pendingSide = side;
      }
      return;
    }
    String problem = firstProblem(seasonsOf(owners), side);
    if (problem != null) {
      for (SObject record : records) {
        record.addError(problem, false);
      }
    }
  }

  /** The refusal for the first clash in these seasons, or null when there is none. */
  public static String firstProblem(
    Set<Id> seasonIds,
    SetTimeMessages.Side side
  ) {
    Set<Id> toRead = new Set<Id>(seasonIds);
    toRead.removeAll(withoutItems);
    if (toRead.isEmpty()) {
      return null;
    }
    Map<Id, SetTimePlan> plans = SetTimePlanReader.read(toRead);
    toRead.removeAll(plans.keySet());
    withoutItems.addAll(toRead);
    for (SetTimePlan plan : plans.values()) {
      SetTimeClash clash = SetTimeClashes.first(plan);
      if (clash != null) {
        return SetTimeMessages.of(clash, CampLabels.forCamp(plan.campId), side);
      }
    }
    return null;
  }

  /** The seasons of the seasons, programs, divisions, and weeks given. */
  private static Set<Id> seasonsOf(Set<Id> owners) {
    Set<Id> seasons = new Set<Id>();
    Set<Id> programs = new Set<Id>();
    Set<Id> divisions = new Set<Id>();
    Set<Id> weeks = new Set<Id>();
    for (Id owner : owners) {
      Schema.SObjectType kind = owner.getSObjectType();
      if (kind == Season__c.SObjectType) {
        seasons.add(owner);
      } else if (kind == Program__c.SObjectType) {
        programs.add(owner);
      } else if (kind == Division__c.SObjectType) {
        divisions.add(owner);
      } else if (kind == Week__c.SObjectType) {
        weeks.add(owner);
      }
    }
    if (!weeks.isEmpty()) {
      for (Week__c week : [
        SELECT Season__c
        FROM Week__c
        WHERE Id IN :weeks
        WITH SYSTEM_MODE
      ]) {
        seasons.add(week.Season__c);
      }
    }
    if (!programs.isEmpty()) {
      for (Program__c program : [
        SELECT Season__c
        FROM Program__c
        WHERE Id IN :programs
        WITH SYSTEM_MODE
      ]) {
        seasons.add(program.Season__c);
      }
    }
    if (!divisions.isEmpty()) {
      for (Division__c division : [
        SELECT Program__r.Season__c
        FROM Division__c
        WHERE Id IN :divisions
        WITH SYSTEM_MODE
      ]) {
        seasons.add(division.Program__r.Season__c);
      }
    }
    return seasons;
  }
}
