/**
 * "Same location?": two or more places in one season whose names differ only in capitals and
 * spacing ("Pool" and "pool") become one (ADR 0012; desktop
 * docs/adr/2026-08-15-locations-merge-and-delete-rehome.md, "merge is a delete that re-points").
 * The director picks the place to keep and how many groups fit there. Everything that points
 * at the others moves to it: activities, fixed and recurring activities, the next season's
 * copies, and their "Open in" weeks; then the others are deleted. All or none, in user mode.
 * Salesforce's Recycle Bin can bring a deleted place back (empty).
 */
public with sharing class LocationMerge {
  // JavaScript's \s, which the screen's "Same name as another" folds: spaces of every kind.
  private static final String SPACES = '[\\s\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+';

  /** The desktop's words, in the camp's word for locations. */
  @TestVisible
  private static String changedMessage(Id keepId) {
    String places = 'locations';
    try {
      List<Location__c> found = [
        SELECT Season__r.Camp__c
        FROM Location__c
        WHERE Id = :keepId
        WITH USER_MODE
      ];
      if (!found.isEmpty()) {
        places = CampLabels.forCamp(found[0].Season__r.Camp__c)
          .pluralInSentence('Location');
      }
    } catch (Exception e) {
      // Can't read it: the model's word will do.
      places = 'locations';
    }
    return 'That merge could not be completed — someone may have changed these ' +
      places +
      '. Try again.';
  }

  public static void mergeInto(
    Id keepId,
    List<Id> otherIds,
    Decimal groupsThatFit
  ) {
    Map<Id, Location__c> places = lockedPlaces(keepId, otherIds);
    SetTimeGuard.defer();
    Savepoint beforeMerge = Database.setSavepoint();
    try {
      Set<Id> others = places.keySet().clone();
      others.remove(keepId);
      moveReferences(keepId, others);
      moveWeeks(keepId, others);
      Database.update(
        new Location__c(Id = keepId, GroupsThatFit__c = groupsThatFit),
        AccessLevel.USER_MODE
      );
      for (Id other : others) {
        WeekExceptions.deleteWithWeeks(other);
      }
      SetTimeGuard.checkPending();
    } catch (Exception e) {
      Database.rollback(beforeMerge);
      throw ScreenErrors.of(e);
    } finally {
      SetTimeGuard.resume();
    }
  }

  /**
   * The places, locked: all still there, in one season, with one name (capitals and spacing
   * aside). Anything else is refused before anything changes.
   */
  private static Map<Id, Location__c> lockedPlaces(
    Id keepId,
    List<Id> otherIds
  ) {
    Set<Id> ids = idsToMerge(keepId, otherIds);
    Map<Id, Location__c> places;
    try {
      places = new Map<Id, Location__c>(
        [
          SELECT Id, Name, Season__c
          FROM Location__c
          WHERE Id IN :ids
          WITH USER_MODE
          FOR UPDATE
        ]
      );
    } catch (QueryException e) {
      // Someone else is saving one of them right now, or they can't be read.
      throw ScreenErrors.of(changedMessage(keepId));
    }
    if (places.size() != ids.size() || !oneSeasonOneName(places, keepId)) {
      throw ScreenErrors.of(changedMessage(keepId));
    }
    return places;
  }

  /** The kept place and the others: locations only, at least two, the kept one once. */
  private static Set<Id> idsToMerge(Id keepId, List<Id> otherIds) {
    Set<Id> ids = new Set<Id>(otherIds == null ? new List<Id>() : otherIds);
    ids.remove(null);
    Boolean usable = keepId != null && !ids.isEmpty() && !ids.contains(keepId);
    ids.add(keepId);
    for (Id id : ids) {
      usable =
        usable &&
        id != null &&
        id.getSObjectType() == Location__c.SObjectType;
    }
    if (!usable) {
      throw ScreenErrors.of('These screens can\'t merge that.');
    }
    return ids;
  }

  private static Boolean oneSeasonOneName(
    Map<Id, Location__c> places,
    Id keepId
  ) {
    Location__c keep = places.get(keepId);
    for (Location__c place : places.values()) {
      if (
        place.Season__c != keep.Season__c ||
        sameNameKey(place.Name) != sameNameKey(keep.Name)
      ) {
        return false;
      }
    }
    return true;
  }

  /** Capitals and spacing aside, as the tables' "Same name as another" compares names. */
  @TestVisible
  private static String sameNameKey(String name) {
    // As the screen folds them: every kind of space, and capitals the same in every locale.
    return name == null
      ? ''
      : name.replaceAll(SPACES, ' ').trim().toLowerCase('en');
  }

  private static void moveReferences(Id keepId, Set<Id> others) {
    List<SObject> moved = new List<SObject>();
    for (Activity__c row : [
      SELECT Id
      FROM Activity__c
      WHERE Location__c IN :others
      WITH USER_MODE
    ]) {
      moved.add(new Activity__c(Id = row.Id, Location__c = keepId));
    }
    for (FixedActivity__c row : [
      SELECT Id
      FROM FixedActivity__c
      WHERE Location__c IN :others
      WITH USER_MODE
    ]) {
      moved.add(new FixedActivity__c(Id = row.Id, Location__c = keepId));
    }
    for (RecurringActivity__c row : [
      SELECT Id
      FROM RecurringActivity__c
      WHERE Location__c IN :others
      WITH USER_MODE
    ]) {
      moved.add(new RecurringActivity__c(Id = row.Id, Location__c = keepId));
    }
    for (Location__c row : [
      SELECT Id
      FROM Location__c
      WHERE CopiedFrom__c IN :others
      WITH USER_MODE
    ]) {
      moved.add(new Location__c(Id = row.Id, CopiedFrom__c = keepId));
    }
    Database.update(moved, AccessLevel.USER_MODE);
  }

  /** A week the others are closed moves to the kept place, unless it is closed then already. */
  private static void moveWeeks(Id keepId, Set<Id> others) {
    Set<Id> closed = new Set<Id>();
    for (WeekException__c mark : [
      SELECT Week__c
      FROM WeekException__c
      WHERE Location__c = :keepId
      WITH USER_MODE
    ]) {
      closed.add(mark.Week__c);
    }
    List<WeekException__c> moved = new List<WeekException__c>();
    List<WeekException__c> twice = new List<WeekException__c>();
    for (WeekException__c mark : [
      SELECT Id, Week__c
      FROM WeekException__c
      WHERE Location__c IN :others
      WITH USER_MODE
    ]) {
      if (closed.add(mark.Week__c)) {
        moved.add(new WeekException__c(Id = mark.Id, Location__c = keepId));
      } else {
        twice.add(mark);
      }
    }
    Database.update(moved, AccessLevel.USER_MODE);
    Database.delete(twice, AccessLevel.USER_MODE);
  }
}
