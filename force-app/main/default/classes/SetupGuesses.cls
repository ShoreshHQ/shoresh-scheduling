/**
 * Rules Shoresh guessed are marked for a look (Greg, build log decision 45; desktop
 * `src/utils/ruleProvenance.js`, `LocationsScreen.jsx` CapacityProvenanceDot, `GroupsScreen.jsx`
 * DivisionProvenanceDot; ADR 0006 §21). What Import last year worked out from the file rather
 * than read outright is remembered for the camp, where import answers are (ImportAnswer__c), with
 * the value it saved (SetupGuessValues). The setup screens mark it until the director says it
 * looks right (SetupGuessConfirm) or changes it. As on the desktop, that is:
 * - a new activity's times a week ("often") and who can do it ("who");
 * - a new place's groups that fit ("fits");
 * - a new group's division ("division"), when only its file's name gave it.
 *
 * The answer is the value saved, so a change anywhere (this screen, Salesforce's record page, a
 * list import) clears the mark. A guess marks only a record that was there when it was made: one
 * set up again later by hand, with the same name, is the director's (an Undo, a delete, a copied
 * season).
 */
public with sharing class SetupGuesses {
  /** One field of one record still as Shoresh guessed it, for the setup screens. */
  public class Guess {
    @AuraEnabled
    public Id recordId;
    @AuraEnabled
    public String field;
    /** The value guessed, where the screen says it (a group's division). */
    @AuraEnabled
    public String value;
  }

  // ---------- an import's save ----------

  /**
   * After an import's save (ImportSetupSaves): its plan's "guessed" entries ({ key, fields }),
   * each a record the import added. Only fields that kind of record can have guessed are kept.
   */
  public static void rememberFromPlan(
    Id campId,
    ImportPlan plan,
    ImportKeys keys
  ) {
    Map<Id, Set<String>> fieldsOf = new Map<Id, Set<String>>();
    for (ImportPlan.Entry entry : plan.entries('guessed')) {
      Id recordId = keys.of(entry.key());
      Set<String> fields = new Set<String>(entry.texts('fields'));
      fields.retainAll(SetupGuessValues.fieldsFor(recordId));
      if (!fields.isEmpty()) {
        fieldsOf.put(recordId, fields);
      }
    }
    SetupGuessRecords.remember(campId, fieldsOf);
  }

  // ---------- the setup screens ----------

  /**
   * The fields of the season's records still as Shoresh guessed them: the value saved then is
   * the value now, and the record was there when it was guessed. One query (the camp's answers);
   * the rest comes from what the setup screen already read.
   */
  public static List<Guess> forSetup(SeasonSetupReader.SeasonSetup setup) {
    SetupGuessStanding standing = new SetupGuessStanding(setup.season.Camp__c);
    if (standing.isEmpty()) {
      return standing.result;
    }
    // Who can do an activity, by division or group Id: "<program>/<name>".
    Map<Id, String> targets = new Map<Id, String>();
    for (SeasonSetupReader.ProgramSetup entry : setup.programs) {
      for (SeasonSetupReader.DivisionSetup d : entry.divisions) {
        targets.put(
          d.division.Id,
          SetupGuessValues.target(entry.program.Name, d.division.Name)
        );
        for (Group__c g : d.groups) {
          targets.put(
            g.Id,
            SetupGuessValues.target(entry.program.Name, g.Name)
          );
          standing.check(
            g,
            SetupGuessValues.item('Group', entry.program.Name, g.Name),
            new Map<String, String>{
              SetupGuessValues.DIVISION => d.division.Name
            }
          );
        }
      }
    }
    for (Location__c row : setup.locations) {
      standing.check(
        row,
        SetupGuessValues.item('Location', '', row.Name),
        new Map<String, String>{
          SetupGuessValues.FITS => SetupGuessValues.wholeText(
            row.GroupsThatFit__c
          )
        }
      );
    }
    for (Activity__c row : setup.activities) {
      List<String> names = new List<String>();
      for (ActivityEligibility__c canDo : row.Eligibilities__r) {
        names.add(
          targets.get(
            canDo.Division__c != null ? canDo.Division__c : canDo.Group__c
          )
        );
      }
      standing.check(
        row,
        SetupGuessValues.item('Activity', '', row.Name),
        new Map<String, String>{
          SetupGuessValues.OFTEN => SetupGuessValues.often(row),
          SetupGuessValues.WHO => SetupGuessValues.who(names)
        }
      );
    }
    return standing.result;
  }
}
