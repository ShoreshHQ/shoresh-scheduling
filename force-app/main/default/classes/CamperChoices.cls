/**
 * A camper's stored elective choices (Preference__c Choices__c and ImportedChoices__c; repo ADR 0017
 * choice 16, ChoicesImport.SheetChoice): writing and reading them, comparing and counting them, and
 * what bringing choices in does to the saved ones. The choices sheet and an outside system both
 * bring choices in through mergeIn, so a person's change wins the same way at either door
 * (ELECT-2.6, API-4.1). No queries, no writes.
 */
public with sharing class CamperChoices {
  /** What bringing choices in does: a new camper's, taken, or a person's kept. */
  public enum Outcome {
    ADDED,
    TAKEN,
    KEPT
  }

  public class Merged {
    public Outcome outcome;
    // Nothing new: already what was last brought in, and the choices used are those or a person's.
    public Boolean unchanged = false;
    // The row to save: a new one, or the saved one's Id with what changes. The caller adds its own.
    public Preference__c row;
  }

  /** The choices as stored: JSON, blank keys left out. */
  public static String write(List<ChoicesImport.SheetChoice> choices) {
    return JSON.serialize(choices, true);
  }

  /** The stored choices (none when blank), or null when stored some other way. */
  public static List<ChoicesImport.SheetChoice> read(String stored) {
    if (String.isBlank(stored)) {
      return new List<ChoicesImport.SheetChoice>();
    }
    try {
      return (List<ChoicesImport.SheetChoice>) JSON.deserialize(
        stored,
        List<ChoicesImport.SheetChoice>.class
      );
    } catch (Exception e) {
      // Not JSON, or a value that isn't one (an "a" that isn't an Id, after an edit outside
      // Shoresh): stored some other way.
      return null;
    }
  }

  /** How many of the stored choices name an activity (none when they can't be read). */
  public static Integer count(String stored) {
    List<ChoicesImport.SheetChoice> choices = read(stored);
    Integer made = 0;
    if (choices == null) {
      return made;
    }
    for (ChoicesImport.SheetChoice choice : choices) {
      if (choice.a != null) {
        made++;
      }
    }
    return made;
  }

  /** Choices compared by what they are, not how they were written down. */
  public static Boolean same(String stored, String other) {
    return signature(stored) == signature(other);
  }

  public static Boolean same(
    String stored,
    List<ChoicesImport.SheetChoice> choices
  ) {
    return signature(stored) == signature(choices);
  }

  /**
   * ELECT-2.6: a person changed them: marked so, or the choices used are no longer the ones last
   * brought in.
   */
  public static Boolean handChanged(Preference__c had) {
    return had.ManualChange__c == true ||
      (had.ImportedChoices__c != null &&
      !same(had.Choices__c, had.ImportedChoices__c));
  }

  /**
   * Incoming choices onto a camper's saved ones (null: none saved). What came in is always kept as
   * imported; the choices used become them unless a person changed them, which are kept.
   */
  public static Merged mergeIn(
    Preference__c had,
    List<ChoicesImport.SheetChoice> incoming
  ) {
    Merged result = new Merged();
    String imported = write(incoming);
    if (had == null) {
      result.outcome = Outcome.ADDED;
      result.row = new Preference__c(
        Choices__c = imported,
        ImportedChoices__c = imported
      );
      return result;
    }
    Boolean byHand = handChanged(had);
    result.unchanged =
      same(had.ImportedChoices__c, incoming) &&
      (byHand || same(had.Choices__c, incoming));
    result.outcome = byHand ? Outcome.KEPT : Outcome.TAKEN;
    result.row = new Preference__c(Id = had.Id, ImportedChoices__c = imported);
    if (!byHand) {
      result.row.Choices__c = imported;
    }
    return result;
  }

  private static String signature(String stored) {
    List<ChoicesImport.SheetChoice> choices = read(stored);
    // Stored some other way: compared as text, so any difference shows.
    return choices == null ? stored : signature(choices);
  }

  private static String signature(List<ChoicesImport.SheetChoice> choices) {
    List<String> parts = new List<String>();
    for (ChoicesImport.SheetChoice choice : choices) {
      parts.add(
        String.join(
          new List<String>{
            ChoicesImportLinked.keyOf(choice),
            String.valueOf(choice.r),
            String.valueOf(choice.k),
            IncomingBatch.fold(choice.d),
            IncomingBatch.fold(choice.p)
          },
          '|'
        )
      );
    }
    parts.sort();
    return String.join(parts, ';');
  }
}
