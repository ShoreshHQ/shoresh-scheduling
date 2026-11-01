/**
 * merge_locations: Camp Setup's "Same location?" Merge through an agent or the command line
 * (docs/protocol/api.md API-1.58): places whose names match, capitals and spacing aside, become
 * one. Web address /v1/merge_locations, POST {season, name, keep, groups_that_fit, seen}. keep and
 * groups_that_fit start where the question starts them; seen is each place's exact name (capitals
 * count) with its groups that fit, as read_same_locations said them. With the places locked, a
 * place added, gone, renamed or changed since is refused (409) with nothing merged; otherwise it is
 * the question's own Merge (SetupTablesController.mergeLocations): everything at the others moves
 * to the one kept, and the others are deleted.
 */
@RestResource(urlMapping='/v1/merge_locations')
global with sharing class AgentMergeLocations implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'name',
    'keep',
    'groups_that_fit',
    'seen'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentMergeLocations());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    Season__c season = AgentChangeCampWords.seasonOf(
      AgentFields.text(body, 'season')
    );
    String places = CampLabels.forCamp(season.Camp__c)
      .pluralInSentence('Location');
    Map<String, Object> seen = AgentSetupFields.given(body.get('seen'));
    if (seen.isEmpty()) {
      throw new ShoreshException(
        'Nothing was merged. Say each place as read_same_locations said it (seen: {exact name: groups_that_fit}).'
      );
    }
    // Locked: no one's save can come between the compare and the merge.
    AgentSameLocations.lock(season.Id);
    List<AgentSameLocations.Place> now = AgentSameLocations.matching(
      season.Id,
      AgentFields.text(body, 'name')
    );
    refuseChanged(now, seen, places);
    AgentSameLocations.Place keep = kept(now, body.get('keep'));
    Decimal fits = fitsAsked(body.get('groups_that_fit'), now);
    List<Id> others = new List<Id>();
    List<String> gone = new List<String>();
    Integer moved = 0;
    for (AgentSameLocations.Place place : now) {
      if (place !== keep) {
        others.add(place.row.Id);
        gone.add('"' + place.row.Name + '"');
        moved += place.activities;
      }
    }
    try {
      // The question's own Merge.
      SetupTablesController.mergeLocations(keep.row.Id, others, fits);
    } catch (Exception e) {
      throw new ShoreshException(
        'Nothing was merged into "' +
          keep.row.Name +
          '". ' +
          ScreenErrors.words(e)
      );
    }
    return 'Merged into "' +
      keep.row.Name +
      '" (groups_that_fit ' +
      fits.intValue() +
      '): ' +
      String.join(gone, ', ') +
      ' deleted, and their ' +
      moved +
      ' ' +
      CampLabels.forCamp(season.Camp__c).pluralInSentence('Activity') +
      ' and everything else there moved to it.';
  }

  /**
   * The places now must be the ones seen, by exact name (capitals count; Apex's == ignores
   * case), each with the groups that fit seen.
   */
  private static void refuseChanged(
    List<AgentSameLocations.Place> now,
    Map<String, Object> seen,
    String places
  ) {
    refuseTwins(now, places);
    Boolean same = now.size() == seen.size();
    for (AgentSameLocations.Place place : now) {
      same = same && seenAsItIs(place, seen);
    }
    if (!same) {
      throw new AgentWeeks.ConflictException(
        'Someone else changed these ' +
          places +
          ' since, so nothing was merged. Read them again with read_same_locations.'
      );
    }
  }

  /** Seen under its exact name (a map's keys compare capitals), with its groups that fit. */
  private static Boolean seenAsItIs(
    AgentSameLocations.Place place,
    Map<String, Object> seen
  ) {
    Object fits = seen.get(place.row.Name);
    return fits != null &&
      String.valueOf(fits)
        .normalizeSpace()
        .equals(AgentSameLocations.fits(place));
  }

  /** Two places named exactly alike can't be told apart by name: left to Camp Setup. */
  private static void refuseTwins(
    List<AgentSameLocations.Place> now,
    String places
  ) {
    Set<String> exact = new Set<String>();
    for (AgentSameLocations.Place place : now) {
      // A Set of text compares capitals: "Pool" and "pool" are two names.
      if (!exact.add(place.row.Name)) {
        throw new ShoreshException(
          'Nothing was merged. Two ' +
            places +
            ' are called exactly "' +
            place.row.Name.left(80) +
            '"; merge them on Camp Setup, where each is its own row.'
        );
      }
    }
  }

  /** The place to keep, by its exact name; left out, the one the question would keep. */
  private static AgentSameLocations.Place kept(
    List<AgentSameLocations.Place> now,
    Object asked
  ) {
    if (asked == null || String.isBlank(String.valueOf(asked))) {
      return AgentSameLocations.keptByDefault(now);
    }
    String name = String.valueOf(asked);
    List<AgentSameLocations.Place> found = new List<AgentSameLocations.Place>();
    List<String> names = new List<String>();
    for (AgentSameLocations.Place place : now) {
      names.add('"' + place.row.Name + '"');
      if (name.equals(place.row.Name)) {
        found.add(place);
      }
    }
    if (found.size() == 1) {
      return found[0];
    }
    throw new ShoreshException(
      'Nothing was merged. ' +
      (found.isEmpty()
        ? 'Say which to keep by its exact name: ' +
          String.join(names, ', ') +
          '.'
        : 'Two of them are called exactly "' +
          name.left(80) +
          '"; choose which to keep on Camp Setup.')
    );
  }

  /** Groups that fit: a whole number, 1 or more, as the question's box takes it. */
  private static Decimal fitsAsked(
    Object asked,
    List<AgentSameLocations.Place> now
  ) {
    String text = asked == null ? '' : String.valueOf(asked).trim();
    if (String.isBlank(text)) {
      return AgentSameLocations.fitsByDefault(now);
    }
    if (!text.isNumeric() || text.length() > 6 || Integer.valueOf(text) < 1) {
      throw new ShoreshException(
        'Nothing was merged. Give groups_that_fit as a whole number, 1 or more.'
      );
    }
    return Decimal.valueOf(text);
  }
}
