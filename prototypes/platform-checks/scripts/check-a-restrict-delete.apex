// Check (a): do restrict-delete lookups block deletes that cascade from a master-detail parent?
// Each scenario builds fresh records, tries one delete, reports, and rolls back.
Camp__c camp = new Camp__c(Name = 'Prototype Camp');
insert camp;


String attempt(String label, Boolean eligibility, Boolean coverage, String target) {
    Savepoint sp = Database.setSavepoint();
    String result;
    try {
        Season__c s = new Season__c(Name = 'S', Camp__c = [SELECT Id FROM Camp__c LIMIT 1].Id);
        insert s;
        Program__c p = new Program__c(Name = 'P', Season__c = s.Id);
        insert p;
        Division__c d = new Division__c(Name = 'D', Program__c = p.Id);
        insert d;
        Group__c g = new Group__c(Name = 'G', Division__c = d.Id);
        insert g;
        Activity__c a = new Activity__c(Name = 'A', Season__c = s.Id);
        insert a;
        if (eligibility) insert new ActivityEligibility__c(Name = 'E', Activity__c = a.Id, Group__c = g.Id);
        if (coverage) insert new Coverage__c(Name = 'C', Season__c = s.Id, Group__c = g.Id);
        Id targetId = target == 'Group' ? g.Id : target == 'Division' ? d.Id : target == 'Program' ? p.Id : target == 'Activity' ? a.Id : s.Id;
        Database.DeleteResult dr = Database.delete(targetId, false);
        if (dr.isSuccess()) {
            result = 'DELETED (groups left: ' + [SELECT COUNT() FROM Group__c WHERE Id = :g.Id] + ', eligibility left: ' + [SELECT COUNT() FROM ActivityEligibility__c] + ', coverage left: ' + [SELECT COUNT() FROM Coverage__c] + ')';
        } else {
            result = 'BLOCKED: ' + dr.getErrors()[0].getStatusCode() + ' - ' + dr.getErrors()[0].getMessage();
        }
    } catch (Exception e) {
        result = 'EXCEPTION: ' + e.getMessage();
    }
    Database.rollback(sp);
    return label + ' => ' + result;
}

List<String> out = new List<String>{
    attempt('A1 control: delete Program, nothing points at its groups', false, false, 'Program'),
    attempt('A2 delete Group directly, Activity Eligibility points at it', true, false, 'Group'),
    attempt('A3 delete Division (cascades to Group), Eligibility points at Group', true, false, 'Division'),
    attempt('A4 delete Program (cascades two levels to Group), Eligibility points at Group', true, false, 'Program'),
    attempt('A5 delete Program, Coverage (detail of Season) points at Group', false, true, 'Program'),
    attempt('A6 delete Season (cascades to both Group and Eligibility)', true, false, 'Season'),
    attempt('A7 delete Season (cascades to both Group and Coverage)', false, true, 'Season'),
    attempt('A8 delete Activity (cascades to Eligibility, which points at Group)', true, false, 'Activity')
};
Savepoint sp2 = Database.setSavepoint();
Season__c s2 = new Season__c(Name = 'S2', Camp__c = camp.Id);
insert s2;
Database.DeleteResult cr = Database.delete(camp.Id, false);
out.add('A9 delete Camp, a Season points at it (top-level restrict) => ' + (cr.isSuccess() ? 'DELETED' : 'BLOCKED: ' + cr.getErrors()[0].getStatusCode() + ' - ' + cr.getErrors()[0].getMessage()));
Database.rollback(sp2);
delete camp;
for (String o : out) System.debug(LoggingLevel.ERROR, 'RESULT ' + o);
