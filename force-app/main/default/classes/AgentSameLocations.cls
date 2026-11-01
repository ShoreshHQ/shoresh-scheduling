/**
 * read_same_locations: Camp Setup's "Same location?" question through an agent or the command
 * line (docs/protocol/api.md API-1.58): the season's places whose names match, capitals and spacing
 * aside, each with its exact name, groups that fit and how many activities happen there, and what
 * the question would keep. Web address /v1/read_same_locations, GET ?season=&name=. What it says
 * goes back to merge_locations as seen.
 */
@RestResource(urlMapping='/v1/read_same_locations')
global with sharing class AgentSameLocations implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{ 'season', 'name' };

  /** One place as the question shows it. */
  public class Place {
    public Location__c row;
    public Integer activities = 0;
  }

  @HttpGet
  global static void get() {
    AgentWeeks.answer(new AgentSameLocations());
  }

  public String run() {
    Map<String, Object> asked = new Map<String, Object>();
    for (String key : RestContext.request.params.keySet()) {
      if (!FIELDS.contains(key)) {
        throw new ShoreshException(
          'Shoresh doesn\'t know the field "' +
            key.left(40) +
            '". The fields are: name, season.'
        );
      }
      asked.put(key, RestContext.request.params.get(key));
    }
    AgentWeeks.requireScheduler();
    Season__c season = AgentChangeCampWords.seasonOf(
      AgentFields.text(asked, 'season')
    );
    CampLabels labels = CampLabels.forCamp(season.Camp__c);
    List<Place> places = matching(season.Id, (String) asked.get('name'));
    List<String> said = new List<String>();
    for (Place place : places) {
      said.add(
        '"' +
          place.row.Name +
          '" (groups_that_fit ' +
          fits(place) +
          ', ' +
          place.activities +
          ' ' +
          (place.activities == 1
            ? labels.singularInSentence('Activity')
            : labels.pluralInSentence('Activity')) +
          ' here)'
      );
    }
    Place keep = keptByDefault(places);
    return 'The ' +
      labels.pluralInSentence('Location') +
      ' whose names match, capitals and spacing aside: ' +
      String.join(said, '; ') +
      '. Camp Setup would keep "' +
      keep.row.Name +
      '" with groups_that_fit ' +
      fitsByDefault(places) +
      '. Send their names exactly and groups_that_fit as seen to merge_locations.';
  }

  /** The season's places, locked until the request ends: no one's save comes in between. */
  public static void lock(Id seasonId) {
    List<Location__c> rows = [
      SELECT Id
      FROM Location__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      FOR UPDATE
    ];
    rows.clear();
  }

  /**
   * The season's places whose names match the name (capitals and spacing aside, as the question
   * finds them), in the table's order. Fewer than two is refused: nothing to merge.
   */
  public static List<Place> matching(Id seasonId, String name) {
    String key = LocationMerge.sameNameKey(name);
    if (String.isBlank(key)) {
      throw new ShoreshException('Say which location (name).');
    }
    List<Location__c> rows = [
      SELECT Id, Name, GroupsThatFit__c
      FROM Location__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY SortOrder__c, Name
    ];
    Map<Id, Place> found = new Map<Id, Place>();
    for (Location__c row : rows) {
      if (LocationMerge.sameNameKey(row.Name) == key) {
        Place place = new Place();
        place.row = row;
        found.put(row.Id, place);
      }
    }
    if (found.size() < 2) {
      throw new ShoreshException(
        'Fewer than two locations are called "' +
          name.normalizeSpace().left(80) +
          '", capitals and spacing aside, so there is nothing to merge.'
      );
    }
    Set<Id> ids = found.keySet();
    for (Activity__c row : [
      SELECT Location__c
      FROM Activity__c
      WHERE Location__c IN :ids
      WITH USER_MODE
    ]) {
      found.get(row.Location__c).activities++;
    }
    return found.values();
  }

  /** Groups that fit as the question shows them: a whole number, or (blank). */
  public static String fits(Place place) {
    Decimal value = place.row.GroupsThatFit__c;
    return value == null ? '(blank)' : String.valueOf(value.intValue());
  }

  /** The question's choice: the most activities, then the most that fit; the first on a tie. */
  public static Place keptByDefault(List<Place> places) {
    Place keep = places[0];
    for (Place place : places) {
      Decimal fit = place.row.GroupsThatFit__c == null
        ? 0
        : place.row.GroupsThatFit__c;
      Decimal kept = keep.row.GroupsThatFit__c == null
        ? 0
        : keep.row.GroupsThatFit__c;
      if (
        place.activities > keep.activities ||
        (place.activities == keep.activities &&
        fit > kept)
      ) {
        keep = place;
      }
    }
    return keep;
  }

  /** The question starts at the most any of them fits, and at least 1. */
  public static Integer fitsByDefault(List<Place> places) {
    Integer most = 1;
    for (Place place : places) {
      if (place.row.GroupsThatFit__c != null) {
        most = Math.max(most, place.row.GroupsThatFit__c.intValue());
      }
    }
    return most;
  }
}
