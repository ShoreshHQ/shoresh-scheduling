// Takes the end-to-end check's made-up camp out of the test org again: "E2E Pinecrest (made up)"
// and everything in its seasons, children before what they point at (Restrict lookups). Touches
// no other camp: every query is limited to this camp's seasons.
final String CAMP_NAME = 'E2E Pinecrest (made up)';
List<Camp__c> camps = [SELECT Id FROM Camp__c WHERE Name = :CAMP_NAME];
if (camps.isEmpty()) {
  System.debug('E2E nothing to clean');
  return;
}
Set<Id> campIds = new Map<Id, Camp__c>(camps).keySet();
Set<Id> s = new Map<Id, Season__c>([SELECT Id FROM Season__c WHERE Camp__c IN :campIds]).keySet();
// An archived season refuses every change (ADR 0029): bring it back first, as Bring back does.
List<Season__c> archived = [SELECT Id FROM Season__c WHERE Id IN :s AND Archived__c = true];
for (Season__c season : archived) {
  season.Archived__c = false;
}
update archived;
delete [SELECT Id FROM Assignment__c WHERE ElectiveRun__r.Season__c IN :s];
delete [SELECT Id FROM Preference__c WHERE ElectiveRun__r.Season__c IN :s];
delete [SELECT Id FROM ElectiveRun__c WHERE Season__c IN :s];
delete [SELECT Id FROM SpecialDate__c WHERE Season__c IN :s];
delete [SELECT Id FROM PlanPart__c WHERE Season__c IN :s];
// Published history is never deleted (PublishedGuard); this made-up camp's is taken out of
// history first, under the guard's own allow(), so the camp can go.
List<Schedule__c> schedules = [SELECT Id FROM Schedule__c WHERE Program__r.Season__c IN :s];
for (Schedule__c schedule : schedules) {
  schedule.Status__c = 'Version';
  schedule.PublishedAt__c = null;
  schedule.PublishedBy__c = null;
  schedule.PublishKey__c = null;
}
PublishedGuard.allow();
update schedules;
delete schedules;
PublishedGuard.done();
delete [SELECT Id FROM WeekException__c WHERE Week__r.Season__c IN :s];
delete [SELECT Id FROM Coverage__c WHERE Season__c IN :s];
delete [SELECT Id FROM LinkedChoiceTime__c WHERE LinkedChoice__r.ElectiveSet__r.Season__c IN :s];
delete [SELECT Id FROM LinkedChoice__c WHERE ElectiveSet__r.Season__c IN :s];
delete [SELECT Id FROM Offering__c WHERE ElectiveSet__r.Season__c IN :s];
delete [SELECT Id FROM ElectiveSet__c WHERE Season__c IN :s];
delete [SELECT Id FROM ActivityEligibility__c WHERE Activity__r.Season__c IN :s];
delete [SELECT Id FROM Camper__c WHERE Season__c IN :s];
delete [SELECT Id FROM SpecialEvent__c WHERE Season__c IN :s];
delete [SELECT Id FROM SpecialDay__c WHERE Season__c IN :s];
delete [SELECT Id FROM Import__c WHERE Season__c IN :s];
delete [SELECT Id FROM Send__c WHERE Season__c IN :s];
delete [SELECT Id FROM FixedActivity__c WHERE Program__r.Season__c IN :s];
delete [SELECT Id FROM RecurringActivity__c WHERE Program__r.Season__c IN :s];
delete [SELECT Id FROM Activity__c WHERE Season__c IN :s];
delete [SELECT Id FROM Location__c WHERE Season__c IN :s];
delete [SELECT Id FROM LocationType__c WHERE Season__c IN :s];
delete [SELECT Id FROM Week__c WHERE Season__c IN :s];
delete [SELECT Id FROM Program__c WHERE Season__c IN :s];
delete [SELECT Id FROM Season__c WHERE Id IN :s];
delete camps;
System.debug('E2E cleaned');
