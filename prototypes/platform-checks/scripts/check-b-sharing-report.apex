// Check (b) report: share rows and per-user access for each season.
Map<Id, Season__c> seasons = new Map<Id, Season__c>([SELECT Id, Name FROM Season__c WHERE Name IN ('A by text', 'B by lookup', 'Neither')]);
for (Season__Share s : [SELECT ParentId, UserOrGroup.Name, RowCause, AccessLevel FROM Season__Share WHERE ParentId IN :seasons.keySet() AND RowCause != 'Owner']) {
    System.debug(LoggingLevel.ERROR, 'RESULT share ' + seasons.get(s.ParentId).Name + ' -> ' + s.UserOrGroup.Name + ' ' + s.RowCause + ' ' + s.AccessLevel);
}
for (User u : [SELECT Id, Alias FROM User WHERE Alias IN ('usera', 'userb', 'usernone') ORDER BY Alias]) {
    for (UserRecordAccess a : [SELECT RecordId, HasReadAccess, HasEditAccess FROM UserRecordAccess WHERE UserId = :u.Id AND RecordId IN :seasons.keySet()]) {
        System.debug(LoggingLevel.ERROR, 'RESULT access ' + u.Alias + ' / ' + seasons.get(a.RecordId).Name + ': read=' + a.HasReadAccess + ' edit=' + a.HasEditAccess);
    }
}
