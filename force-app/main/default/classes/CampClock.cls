/**
 * When something happened, said on the camp's clock (CORE-6.11): every time Shoresh says (an
 * import, a version saved or published) is in the camp's time zone, as its dates already are
 * (MEMO-7.2, ADR 0021 choice 9), so one list never mixes two clocks. A camp with no time zone set
 * says it in the person's own, as Salesforce does. Times already written into a saved version's
 * name stay as written; Salesforce's own record pages keep each person's setting.
 *
 * The camp's time zone is read in system mode on purpose: only how a time is said comes of it,
 * for a season or program the person already reads.
 */
public with sharing class CampClock {
  private static final Map<Id, String> BY_SEASON = new Map<Id, String>();
  private static final Map<Id, String> BY_PROGRAM = new Map<Id, String>();

  /** The camp's time zone ("America/New_York"), or null when it has none set. */
  public static String zoneOfSeason(Id seasonId) {
    if (!BY_SEASON.containsKey(seasonId)) {
      keep(
        [
          SELECT Id, Camp__r.TimeZone__c, (SELECT Id FROM Programs__r)
          FROM Season__c
          WHERE Id = :seasonId
          WITH SYSTEM_MODE
        ]
      );
      BY_SEASON.put(seasonId, BY_SEASON.get(seasonId));
    }
    return BY_SEASON.get(seasonId);
  }

  /** The same for a program's camp, read once for all its season's programs. */
  public static String zoneOfProgram(Id programId) {
    if (!BY_PROGRAM.containsKey(programId)) {
      keep(
        [
          SELECT Id, Camp__r.TimeZone__c, (SELECT Id FROM Programs__r)
          FROM Season__c
          WHERE Id IN (SELECT Season__c FROM Program__c WHERE Id = :programId)
          WITH SYSTEM_MODE
        ]
      );
      BY_PROGRAM.put(programId, BY_PROGRAM.get(programId));
    }
    return BY_PROGRAM.get(programId);
  }

  /** A draft's camp's, as its locked read has it (no read more); else as its program's. */
  public static String zoneOfDraft(Schedule__c draft) {
    try {
      return draft.Program__r.Season__r.Camp__r.TimeZone__c;
    } catch (SObjectException notRead) {
      return zoneOfProgram(draft.Program__c);
    }
  }

  /** Each season's zone, and its programs', so a request about several costs one read (CORE-6.11). */
  private static void keep(List<Season__c> seasons) {
    for (Season__c season : seasons) {
      BY_SEASON.put(season.Id, season.Camp__r.TimeZone__c);
      for (Program__c program : season.Programs__r) {
        BY_PROGRAM.put(program.Id, season.Camp__r.TimeZone__c);
      }
    }
  }

  /** The moment in the pattern ("d MMM yyyy h:mm a") on that clock; the person's own with none. */
  public static String say(Datetime moment, String pattern, String zone) {
    return String.isBlank(zone)
      ? moment.format(pattern)
      : moment.format(pattern, zone);
  }
}
