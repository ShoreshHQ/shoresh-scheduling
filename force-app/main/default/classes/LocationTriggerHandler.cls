/** Locations: the location type must belong to the same season as the location. */
public with sharing class LocationTriggerHandler {
  public static void beforeSave(List<Location__c> locations) {
    Set<Id> typeIds = new Set<Id>();
    Set<Id> seasonIds = new Set<Id>();
    for (Location__c location : locations) {
      seasonIds.add(location.Season__c);
      if (location.LocationType__c != null) {
        typeIds.add(location.LocationType__c);
      }
    }
    if (typeIds.isEmpty()) {
      return;
    }
    Map<Id, LocationType__c> types = new Map<Id, LocationType__c>(
      [
        SELECT Id, Season__c
        FROM LocationType__c
        WHERE Id IN :typeIds
        WITH SYSTEM_MODE
      ]
    );
    Map<Id, CampLabels> labelsBySeason = SetupSeasons.labelsBySeason(seasonIds);
    for (Location__c location : locations) {
      LocationType__c type = types.get(location.LocationType__c);
      if (type != null && type.Season__c != location.Season__c) {
        location.LocationType__c.addError(
          SetupSeasons.otherSeason(
            labelsBySeason.get(location.Season__c),
            'LocationType',
            'Location'
          )
        );
      }
    }
  }
}
