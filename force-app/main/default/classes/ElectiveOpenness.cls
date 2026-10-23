/**
 * Who can take an elective's activity at an elective time (electives slice E7; repo ADR 0018
 * choice 30): its eligibility rows, none meaning everyone; open at a time when a row names its
 * division or one of the bunks there (c/shoreshEngine readEligibility's rule, per division).
 */
public with sharing class ElectiveOpenness {
  private Map<Id, List<ActivityEligibility__c>> rowsByActivity = new Map<Id, List<ActivityEligibility__c>>();

  public ElectiveOpenness(List<ActivityEligibility__c> rows) {
    for (ActivityEligibility__c row : rows) {
      if (!rowsByActivity.containsKey(row.Activity__c)) {
        rowsByActivity.put(row.Activity__c, new List<ActivityEligibility__c>());
      }
      rowsByActivity.get(row.Activity__c).add(row);
    }
  }

  public Boolean openAt(Id activityId, ElectivePeriod at) {
    List<ActivityEligibility__c> rows = rowsByActivity.get(activityId);
    if (rows == null) {
      return true;
    }
    Set<Id> groups = new Set<Id>(at.groupIds);
    for (ActivityEligibility__c row : rows) {
      if (
        (row.Division__c != null && row.Division__c == at.divisionId) ||
        (row.Group__c != null && groups.contains(row.Group__c))
      ) {
        return true;
      }
    }
    return false;
  }
}
