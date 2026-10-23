/**
 * One elective time (electives slice E7; repo ADR 0018 choice 30): a day, a time block and a
 * division where an elective set sits on a schedule, the bunks there, and the set's offerings it
 * offers. Worked out by ElectiveTimes, sent to the seats screen as it is.
 */
public with sharing class ElectivePeriod {
  // "2027-07-06|<block>|<division>" (ElectiveTimes.keyOf), the same in the browser.
  @AuraEnabled
  public String key;
  @AuraEnabled
  public Date day;
  @AuraEnabled
  public String blockId;
  @AuraEnabled
  public String blockName;
  @AuraEnabled
  public String startTime;
  @AuraEnabled
  public Integer blockOrder;
  @AuraEnabled
  public Id divisionId;
  @AuraEnabled
  public Integer divisionOrder;
  @AuraEnabled
  public List<Id> groupIds = new List<Id>();
  // The set's confirmed offerings this time offers (open to it), in the activities' name order.
  @AuraEnabled
  public List<Id> offeringIds = new List<Id>();

  /** "Tuesday, Period 3": the time in words, for a message. */
  public String words() {
    return Datetime.newInstance(day, Time.newInstance(12, 0, 0, 0))
        .format('EEEE') +
      ', ' +
      blockName;
  }
}
