// Check (b) setup: put the three test users in place (permission set + group membership).
Id psId = [SELECT Id FROM PermissionSet WHERE Name = 'Prototype_Scheduler'].Id;
Map<String, Id> g = new Map<String, Id>();
for (Group x : [SELECT Id, DeveloperName FROM Group WHERE DeveloperName LIKE 'Camp%_Schedulers']) g.put(x.DeveloperName, x.Id);
Map<String, Id> u = new Map<String, Id>();
for (User x : [SELECT Id, Alias FROM User WHERE Alias IN ('usera', 'userb', 'usernone')]) u.put(x.Alias, x.Id);
List<PermissionSetAssignment> psa = new List<PermissionSetAssignment>();
for (Id uid : u.values()) psa.add(new PermissionSetAssignment(AssigneeId = uid, PermissionSetId = psId));
insert psa;
insert new List<GroupMember>{
    new GroupMember(GroupId = g.get('CampA_Schedulers'), UserOrGroupId = u.get('usera')),
    new GroupMember(GroupId = g.get('CampB_Schedulers'), UserOrGroupId = u.get('userb'))
};
