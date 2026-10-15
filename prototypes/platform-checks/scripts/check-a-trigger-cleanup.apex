// Check (a) follow-up: with the ProgramCleanup before-delete trigger deployed, does deleting a program
// whose group is covered by a Coverage row now succeed?
Savepoint sp = Database.setSavepoint();
Camp__c camp = new Camp__c(Name = 'T');
insert camp;
Season__c s = new Season__c(Name = 'S', Camp__c = camp.Id);
insert s;
Program__c p = new Program__c(Name = 'P', Season__c = s.Id);
insert p;
Division__c d = new Division__c(Name = 'D', Program__c = p.Id);
insert d;
Group__c g = new Group__c(Name = 'G', Division__c = d.Id);
insert g;
insert new Coverage__c(Name = 'C', Season__c = s.Id, Group__c = g.Id);
Database.DeleteResult dr = Database.delete(p.Id, false);
System.debug(LoggingLevel.ERROR, 'RESULT A10 delete Program with before-delete cleanup trigger => ' + (dr.isSuccess() ? 'DELETED (coverage left: ' + [SELECT COUNT() FROM Coverage__c WHERE Season__c = :s.Id] + ')' : 'BLOCKED: ' + dr.getErrors()[0].getMessage()));
Database.rollback(sp);
