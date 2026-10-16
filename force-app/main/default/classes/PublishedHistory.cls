/**
 * Protects history: a season, program, or week with any published schedule cannot be deleted
 * (data model, "Protecting history"). Schedules do not exist yet, so the finder that looks for
 * them is a stand-in that finds none. When Schedule__c is built, replace NoSchedulesYet with a
 * query for schedules that were ever published (PublishedAt__c set) under the given records.
 * Deleting a season removes its programs and weeks without running their own delete checks,
 * so the season check must look at schedules under the season's programs and weeks too.
 */
public with sharing class PublishedHistory {
  public interface Finder {
    /** The subset of recordIds (seasons, programs, or weeks) that have published history. */
    Set<Id> withPublishedHistory(Set<Id> recordIds);
  }

  @TestVisible
  private static Finder finder = new NoSchedulesYet();

  /**
   * Adds an error to every record in oldRecords that has published history, so the delete is
   * refused with a message in the camp's own words. Call from a before-delete trigger.
   */
  public static void refuseDeletes(
    List<SObject> oldRecords,
    String term,
    Map<Id, Id> campIdByRecordId
  ) {
    Set<Id> protectedIds = finder.withPublishedHistory(
      new Map<Id, SObject>(oldRecords).keySet()
    );
    if (protectedIds.isEmpty()) {
      return;
    }
    Map<Id, CampLabels> labelsByCamp = CampLabels.forCamps(
      new Set<Id>(campIdByRecordId.values())
    );
    for (SObject record : oldRecords) {
      if (protectedIds.contains(record.Id)) {
        CampLabels labels = labelsByCamp.get(campIdByRecordId.get(record.Id));
        record.addError(message(labels, term, (String) record.get('Name')));
      }
    }
  }

  @TestVisible
  private static String message(CampLabels labels, String term, String name) {
    String text =
      '"' +
      name +
      '" has ' +
      labels.pluralInSentence('PublishedSchedule') +
      ', which are kept as history, so this ' +
      labels.singularInSentence(term) +
      ' can\'t be deleted.';
    if (term == 'Season') {
      text += ' Mark it Finished instead.';
    }
    return text;
  }

  private class NoSchedulesYet implements Finder {
    public Set<Id> withPublishedHistory(Set<Id> recordIds) {
      return new Set<Id>();
    }
  }
}
