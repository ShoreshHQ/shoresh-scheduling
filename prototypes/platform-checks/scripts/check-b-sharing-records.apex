// Check (b): seasons owned by the admin; which test users can see and edit each one?
Camp__c campA = new Camp__c(Name = 'Camp A');
insert campA;
Camp__c campB = [SELECT Id FROM Camp__c WHERE Name = 'Camp B' LIMIT 1]; // the record the lookup rule names
List<Season__c> seasons = new List<Season__c>{
    new Season__c(Name = 'A by text', Camp__c = campA.Id, CampName__c = 'Camp A'),
    new Season__c(Name = 'B by lookup', Camp__c = campB.Id, CampName__c = 'Camp B'),
    new Season__c(Name = 'Neither', Camp__c = campA.Id, CampName__c = 'Camp C')
};
insert seasons;
