/**
 * What the setup screens mark as guessed from a file (ADR 0006 §21), said for an agent or the
 * command line (docs/protocol/api.md API-1.59, API-1.60): the screen's own read
 * (SeasonSetupController.getSeasonSetup, its guesses), each guess named by its kind in the camp's
 * words, its name, where it sits (a group's program, a linked choice's elective set), its field
 * and its value now, so read_setup_guesses and confirm_setup_guess say them the same way.
 */
public with sharing class AgentGuesses {
  // The field as the agent names it, by the guess's own field.
  private static final Map<String, String> SAID = new Map<String, String>{
    SetupGuessValues.OFTEN => 'how_often',
    SetupGuessValues.WHO => 'who',
    SetupGuessValues.FITS => 'groups_that_fit',
    SetupGuessValues.DIVISION => 'division',
    SetupGuessValues.PERIODS => 'periods'
  };

  /** One field of one record still marked as guessed. */
  public class Entry {
    public Id recordId;
    /** Its model term: Activity, Location, Group or LinkedChoice. */
    public String term;
    public String kind;
    public String name;
    /** A group's program, a linked choice's elective set; null otherwise. */
    public String place;
    public String field;
    /** The guess's own field name, as confirmGuess takes it. */
    public String guessField;
    public String value;

    /** As read_setup_guesses says it. */
    public String said() {
      return kind +
        ' "' +
        name +
        '"' +
        (place == null
          ? ''
          : (term == 'Group' ? ' in program "' : ' in elective set "') +
            place +
            '"') +
        ': ' +
        field +
        ' ' +
        value;
    }
  }

  /** The season's guesses still marked, in the screen's order, as the setup screen reads them. */
  public static List<Entry> standing(Id seasonId, CampLabels labels) {
    SeasonSetupReader.SeasonSetup setup = SeasonSetupController.getSeasonSetup(
      seasonId
    );
    Map<Id, Entry> about = new Map<Id, Entry>();
    Map<Id, String> whoNames = new Map<Id, String>();
    for (SeasonSetupReader.ProgramSetup entry : setup.programs) {
      for (SeasonSetupReader.DivisionSetup d : entry.divisions) {
        // DIV-1.1: a holding record reads as its group, never by its own name (one with no group
        // left keeps its own, so who can do it is never said as everyone when it is not).
        whoNames.put(
          d.division.Id,
          d.division.NoDivision__c && !d.groups.isEmpty()
            ? d.groups[0].Name
            : d.division.Name
        );
        for (Group__c g : d.groups) {
          whoNames.put(g.Id, g.Name);
          about.put(
            g.Id,
            entry(g.Id, 'Group', labels, g.Name, entry.program.Name)
          );
        }
      }
    }
    Map<Id, Activity__c> activities = new Map<Id, Activity__c>(
      setup.activities
    );
    for (Activity__c row : setup.activities) {
      about.put(row.Id, entry(row.Id, 'Activity', labels, row.Name, null));
    }
    Map<Id, Location__c> locations = new Map<Id, Location__c>(setup.locations);
    for (Location__c row : setup.locations) {
      about.put(row.Id, entry(row.Id, 'Location', labels, row.Name, null));
    }
    Map<Id, String> periodsOf = linkedChoices(setup, about, labels);
    List<Entry> result = new List<Entry>();
    for (SetupGuesses.Guess guess : setup.guesses) {
      Entry known = about.get(guess.recordId);
      if (known == null || !SAID.containsKey(guess.field)) {
        continue;
      }
      Entry one = entry(
        known.recordId,
        known.term,
        labels,
        known.name,
        known.place
      );
      one.guessField = guess.field;
      one.field = SAID.get(guess.field);
      if (guess.field == SetupGuessValues.OFTEN) {
        one.value = often(activities.get(guess.recordId));
      } else if (guess.field == SetupGuessValues.WHO) {
        one.value = who(activities.get(guess.recordId), whoNames);
      } else if (guess.field == SetupGuessValues.FITS) {
        one.value = SetupGuessValues.wholeText(
          locations.get(guess.recordId).GroupsThatFit__c
        );
      } else if (guess.field == SetupGuessValues.DIVISION) {
        one.value = String.isBlank(guess.value) ? 'none' : guess.value;
      } else {
        one.value = periodsOf.get(guess.recordId);
      }
      result.add(one);
    }
    return result;
  }

  private static Entry entry(
    Id recordId,
    String term,
    CampLabels labels,
    String name,
    String place
  ) {
    Entry result = new Entry();
    result.recordId = recordId;
    result.term = term;
    result.kind = term == 'LinkedChoice'
      ? 'linked choice'
      : labels.singularInSentence(term);
    result.name = name;
    result.place = place;
    return result;
  }

  /** Linked choices by Id (in about), and each one's periods as the Electives screen says them. */
  private static Map<Id, String> linkedChoices(
    SeasonSetupReader.SeasonSetup setup,
    Map<Id, Entry> about,
    CampLabels labels
  ) {
    Map<Id, String> result = new Map<Id, String>();
    if (setup.electives == null) {
      return result;
    }
    Map<Id, String> blockNames = new Map<Id, String>();
    for (SeasonSetupReader.ProgramSetup entry : setup.programs) {
      for (TimeBlock__c block : entry.timeBlocks) {
        blockNames.put(block.Id, block.Name);
      }
    }
    Map<Id, String> setNames = new Map<Id, String>();
    for (ElectiveSet__c row : setup.electives.sets) {
      setNames.put(row.Id, row.Name);
    }
    for (LinkedChoice__c row : setup.electives.linkedChoices) {
      about.put(
        row.Id,
        entry(
          row.Id,
          'LinkedChoice',
          labels,
          row.Name,
          setNames.get(row.ElectiveSet__c)
        )
      );
      List<String> periods = new List<String>();
      for (LinkedChoiceTime__c period : row.Times__r) {
        periods.add(
          (period.Weekday__c == null ? '' : period.Weekday__c + ' ') +
          blockNames.get(period.TimeBlock__c)
        );
      }
      periods.sort();
      result.put(row.Id, String.join(periods, ', '));
    }
    return result;
  }

  /** Times a week as the activity holds them now. */
  private static String often(Activity__c row) {
    String fewest = SetupGuessValues.wholeText(row.TimesPerWeekMin__c);
    String most = SetupGuessValues.wholeText(row.TimesPerWeekMax__c);
    if (row.NoWeeklyMax__c) {
      return (String.isBlank(fewest) ? '(blank)' : fewest) +
        ' a week, no weekly most';
    }
    if (String.isBlank(most)) {
      return (String.isBlank(fewest) ? '(blank)' : fewest) + ' a week';
    }
    return (String.isBlank(fewest) ? '(blank)' : fewest) +
      ' to ' +
      most +
      ' a week';
  }

  /** Who can do it: everyone, or each division and group by name, in order. */
  private static String who(Activity__c row, Map<Id, String> whoNames) {
    List<String> names = new List<String>();
    for (ActivityEligibility__c canDo : row.Eligibilities__r) {
      String name = whoNames.get(
        canDo.Division__c != null ? canDo.Division__c : canDo.Group__c
      );
      if (name != null) {
        names.add(name);
      }
    }
    if (names.isEmpty()) {
      return 'everyone';
    }
    names.sort();
    return String.join(names, ', ');
  }
}
