// Check (a) follow-up: can a before-delete trigger clear restrict-delete references before Salesforce checks them?
trigger ProgramCleanup on Program__c (before delete) {
    delete [SELECT Id FROM Coverage__c WHERE Group__r.Division__r.Program__c IN :Trigger.oldMap.keySet()];
}
