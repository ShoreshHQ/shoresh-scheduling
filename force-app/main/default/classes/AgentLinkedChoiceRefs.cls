/**
 * What a person's AI names when it makes or changes a linked choice (docs/protocol/api.md API-1.131
 * to API-1.134), as the records the linked choices editor's gestures send: the set, the offering,
 * the linked choice, and the periods and divisions the editor offers. The editor only offers a
 * period where the set sits and a division there, so anything else is refused here. Read in user
 * mode: the person's own access.
 */
public with sharing class AgentLinkedChoiceRefs {
  private static final String NOTHING = ' Nothing was changed.';
  private static final Map<String, String> APPLIES_TO = new Map<String, String>{
    'all' => 'All',
    'only these' => 'OnlyThese',
    'onlythese' => 'OnlyThese',
    'all except' => 'AllExcept',
    'allexcept' => 'AllExcept'
  };

  public Season__c season;
  public ElectiveSet__c electiveSet;
  public CampLabels labels;
  private LinkedChoicePlaces.Places placesRead;
  private String word;

  /** The season and the set asked for (season, elective_set). */
  public AgentLinkedChoiceRefs(Map<String, Object> body) {
    season = OutgoingRows.seasonCalled(AgentFields.text(body, 'season'));
    DayWords.use(season.Id);
    labels = CampLabels.forCamp(
      [SELECT Camp__c FROM Season__c WHERE Id = :season.Id WITH USER_MODE]
      .Camp__c
    );
    word = labels.singularInSentence('LinkedChoice');
    electiveSet = setOf(AgentFields.text(body, 'elective_set'));
  }

  /** Where the set sits: read once, and only when asked, since it reads the season's schedules. */
  public LinkedChoicePlaces.Places places() {
    placesRead = placesRead ?? LinkedChoicePlaces.of(electiveSet.Id);
    return placesRead;
  }

  /** The camp's word for a linked choice, in a sentence. */
  public String word() {
    return word;
  }

  private ElectiveSet__c setOf(String asked) {
    List<ElectiveSet__c> sets = [
      SELECT Id, Name
      FROM ElectiveSet__c
      WHERE Season__c = :season.Id
      WITH USER_MODE
      ORDER BY Name
    ];
    String what = labels.singularInSentence('ElectiveSet');
    if (sets.isEmpty()) {
      throw new ShoreshException(
        season.Name + ' has no ' + what + '.' + NOTHING
      );
    }
    if (String.isBlank(asked) && sets.size() == 1) {
      return sets[0];
    }
    List<String> names = new List<String>();
    for (ElectiveSet__c each : sets) {
      if (IncomingBatch.fold(each.Name) == IncomingBatch.fold(asked)) {
        return each;
      }
      names.add(each.Name);
    }
    throw new ShoreshException(
      (String.isBlank(asked)
          ? 'Say which ' + what + ' (elective_set).'
          : 'No ' + what + ' called "' + asked.left(80) + '".') +
        ' There are: ' +
        String.join(names, ', ') +
        '.'
    );
  }

  /** The set's offering of this activity. */
  public Offering__c offeringOf(String activity) {
    List<String> names = new List<String>();
    for (Offering__c each : [
      SELECT Id, NoSeatLimit__c, Activity__r.Name
      FROM Offering__c
      WHERE ElectiveSet__c = :electiveSet.Id
      WITH USER_MODE
      ORDER BY Activity__r.Name
    ]) {
      if (
        IncomingBatch.fold(each.Activity__r.Name) ==
        IncomingBatch.fold(activity)
      ) {
        return each;
      }
      names.add(each.Activity__r.Name);
    }
    throw new ShoreshException(
      (String.isBlank(activity)
          ? 'Say which ' +
            labels.singularInSentence('Activity') +
            ' (activity).'
          : electiveSet.Name + ' doesn\'t offer "' + activity.left(80) + '".') +
        ' It offers: ' +
        String.join(names, ', ') +
        '.'
    );
  }

  /** The one linked choice of the set with this name (name), and of this activity if said. */
  public LinkedChoice__c choiceOf(Map<String, Object> body) {
    String name = AgentFields.text(body, 'name');
    String activity = AgentFields.text(body, 'activity');
    List<LinkedChoice__c> found = new List<LinkedChoice__c>();
    List<String> names = new List<String>();
    for (LinkedChoice__c each : [
      SELECT
        Id,
        Name,
        AppliesTo__c,
        Offering__r.Activity__r.Name,
        (SELECT Weekday__c, TimeBlock__c FROM Times__r),
        (SELECT Division__c FROM Coverages__r)
      FROM LinkedChoice__c
      WHERE ElectiveSet__c = :electiveSet.Id
      WITH USER_MODE
      ORDER BY SortOrder__c
    ]) {
      names.add(each.Name);
      Boolean ofIt =
        String.isBlank(activity) ||
        IncomingBatch.fold(each.Offering__r.Activity__r.Name) ==
        IncomingBatch.fold(activity);
      if (ofIt && IncomingBatch.fold(each.Name) == IncomingBatch.fold(name)) {
        found.add(each);
      }
    }
    if (found.size() == 1) {
      return found[0];
    }
    throw new ShoreshException(
      found.isEmpty() ? noSuch(name, names) : twoCalled(found, activity)
    );
  }

  private String noSuch(String name, List<String> names) {
    String start = String.isBlank(name)
      ? 'Say which ' + word + ' (name).'
      : electiveSet.Name +
        ' has no ' +
        word +
        ' called "' +
        name.left(80) +
        '".';
    return names.isEmpty()
      ? start
      : start + ' It has: ' + String.join(names, ', ') + '.';
  }

  private String twoCalled(List<LinkedChoice__c> found, String activity) {
    String start =
      found.size() +
      ' of ' +
      electiveSet.Name +
      '\'s ' +
      labels.pluralInSentence('LinkedChoice') +
      ' are called "' +
      found[0].Name +
      '"';
    return String.isBlank(activity)
      ? start +
        ', so Shoresh can\'t tell which you mean (activity says whose).' +
        NOTHING
      : start +
        ', of the same ' +
        labels.singularInSentence('Activity') +
        ', so Shoresh can\'t tell which you mean.' +
        NOTHING;
  }

  /** "OnlyThese" from "Only these", or null when it isn't said. */
  public static String appliesToOf(Map<String, Object> body) {
    String asked = AgentFields.text(body, 'applies_to');
    if (String.isBlank(asked)) {
      return null;
    }
    String value = APPLIES_TO.get(asked.toLowerCase());
    if (value == null) {
      throw new ShoreshException(
        'It applies to All, Only these or All except (applies_to).'
      );
    }
    return value;
  }

  /** A name is at most what the editor's field takes. */
  public static void refuseLongName(String name) {
    if (name != null && name.length() > 80) {
      throw new ShoreshException(
        '"' + name.left(80) + '…" is longer than 80 characters.' + NOTHING
      );
    }
  }
}
