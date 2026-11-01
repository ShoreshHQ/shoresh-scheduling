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

    public Entry(SObject record, String term, String place) {
      this.recordId = record == null ? null : record.Id;
      this.name = record == null ? null : (String) record.get('Name');
      this.term = term;
      this.place = place;
    }

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
    Reading reading = new Reading(
      SeasonSetupController.getSeasonSetup(seasonId)
    );
    List<Entry> result = new List<Entry>();
    for (SetupGuesses.Guess guess : reading.setup.guesses) {
      Entry known = reading.about.get(guess.recordId);
      if (known == null || !SAID.containsKey(guess.field)) {
        continue;
      }
      Entry one = new Entry(null, known.term, known.place);
      one.recordId = known.recordId;
      one.name = known.name;
      one.kind = known.term == 'LinkedChoice'
        ? 'linked choice'
        : labels.singularInSentence(known.term);
      one.guessField = guess.field;
      one.field = SAID.get(guess.field);
      one.value = reading.valueOf(guess);
      result.add(one);
    }
    return result;
  }

  /** The setup screen's read, by record: what each guess names and the values it holds. */
  private class Reading {
    final SeasonSetupReader.SeasonSetup setup;
    final Map<Id, Entry> about = new Map<Id, Entry>();
    final Map<Id, String> whoNames = new Map<Id, String>();
    final Map<Id, Activity__c> activities;
    final Map<Id, Location__c> locations;
    final Map<Id, String> periodsOf = new Map<Id, String>();

    Reading(SeasonSetupReader.SeasonSetup setup) {
      this.setup = setup;
      this.activities = new Map<Id, Activity__c>(setup.activities);
      this.locations = new Map<Id, Location__c>(setup.locations);
      for (Activity__c row : setup.activities) {
        about.put(row.Id, new Entry(row, 'Activity', null));
      }
      for (Location__c row : setup.locations) {
        about.put(row.Id, new Entry(row, 'Location', null));
      }
      for (SeasonSetupReader.ProgramSetup entry : setup.programs) {
        readProgram(entry);
      }
      readLinkedChoices();
    }

    private void readProgram(SeasonSetupReader.ProgramSetup entry) {
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
          about.put(g.Id, new Entry(g, 'Group', entry.program.Name));
        }
      }
    }

    /** Linked choices, and each one's periods as the Electives screen says them. */
    private void readLinkedChoices() {
      if (setup.electives == null) {
        return;
      }
      Map<Id, String> blockNames = new Map<Id, String>();
      for (SeasonSetupReader.ProgramSetup entry : setup.programs) {
        for (TimeBlock__c block : entry.timeBlocks) {
          blockNames.put(block.Id, block.Name);
        }
      }
      Map<Id, ElectiveSet__c> sets = new Map<Id, ElectiveSet__c>(
        setup.electives.sets
      );
      for (LinkedChoice__c row : setup.electives.linkedChoices) {
        ElectiveSet__c inSet = sets.get(row.ElectiveSet__c);
        about.put(
          row.Id,
          new Entry(row, 'LinkedChoice', inSet == null ? null : inSet.Name)
        );
        List<String> periods = new List<String>();
        for (LinkedChoiceTime__c period : row.Times__r) {
          periods.add(
            (period.Weekday__c == null ? '' : period.Weekday__c + ' ') +
            blockNames.get(period.TimeBlock__c)
          );
        }
        periods.sort();
        periodsOf.put(row.Id, String.join(periods, ', '));
      }
    }

    /** The guessed field's value now, as the screen shows it. */
    String valueOf(SetupGuesses.Guess guess) {
      if (guess.field == SetupGuessValues.OFTEN) {
        return often(activities.get(guess.recordId));
      }
      if (guess.field == SetupGuessValues.WHO) {
        return who(activities.get(guess.recordId));
      }
      if (guess.field == SetupGuessValues.FITS) {
        return SetupGuessValues.wholeText(
          locations.get(guess.recordId).GroupsThatFit__c
        );
      }
      if (guess.field == SetupGuessValues.DIVISION) {
        return String.isBlank(guess.value) ? 'none' : guess.value;
      }
      return periodsOf.get(guess.recordId);
    }

    /** Who can do it: everyone, or each division and group by name, in order. */
    private String who(Activity__c row) {
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

  /** Times a week as the activity holds them now. */
  private static String often(Activity__c row) {
    String fewest = SetupGuessValues.wholeText(row.TimesPerWeekMin__c);
    String most = SetupGuessValues.wholeText(row.TimesPerWeekMax__c);
    String start = String.isBlank(fewest) ? '(blank)' : fewest;
    if (row.NoWeeklyMax__c) {
      return start + ' a week, no weekly most';
    }
    return String.isBlank(most)
      ? start + ' a week'
      : start + ' to ' + most + ' a week';
  }
}
