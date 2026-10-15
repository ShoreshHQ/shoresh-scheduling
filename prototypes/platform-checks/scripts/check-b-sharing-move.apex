// Check (b): moving a season to another camp moves access (rules re-evaluate on update).
Season__c s = [SELECT Id FROM Season__c WHERE Name = 'Neither'];
s.CampName__c = 'Camp A';
update s;
Season__c b = [SELECT Id FROM Season__c WHERE Name = 'B by lookup'];
b.Camp__c = [SELECT Id FROM Camp__c WHERE Name = 'Camp A' LIMIT 1].Id;
update b;
Id ua = [SELECT Id FROM User WHERE Alias = 'usera'].Id;
Id ub = [SELECT Id FROM User WHERE Alias = 'userb'].Id;
System.debug(LoggingLevel.ERROR, 'RESULT usera reads former Neither (text now Camp A): ' + [SELECT RecordId, HasReadAccess FROM UserRecordAccess WHERE UserId = :ua AND RecordId = :s.Id].HasReadAccess);
System.debug(LoggingLevel.ERROR, 'RESULT userb reads B after its camp lookup moved to Camp A: ' + [SELECT RecordId, HasReadAccess FROM UserRecordAccess WHERE UserId = :ub AND RecordId = :b.Id].HasReadAccess);
