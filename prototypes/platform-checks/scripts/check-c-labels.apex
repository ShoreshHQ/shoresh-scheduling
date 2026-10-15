// Check (c): after deploying an English (org default language) translation for Group__c,
// what label does Salesforce show for the object and its field?
Schema.DescribeSObjectResult d = Group__c.SObjectType.getDescribe();
System.debug(LoggingLevel.ERROR, 'RESULT object label: ' + d.getLabel() + ' / plural: ' + d.getLabelPlural());
System.debug(LoggingLevel.ERROR, 'RESULT field Division__c label: ' + Group__c.Division__c.getDescribe().getLabel());
System.debug(LoggingLevel.ERROR, 'RESULT running user language: ' + UserInfo.getLanguage());
