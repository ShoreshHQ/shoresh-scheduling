/**
 * Test users for what a person may read: a scheduler whose camp's admin hid one field. Synthetic
 * data only.
 */
@IsTest
public class FieldAccessTestData {
  /**
   * A Standard User with a copy of Shoresh Scheduler that can't read this one field, as when a
   * camp's admin hides a field from schedulers.
   */
  public static User schedulerWithout(Schema.SObjectField hidden) {
    Schema.DescribeFieldResult field = hidden.getDescribe();
    String hiddenName =
      field.getSObjectType().getDescribe().getName() +
      '.' +
      field.getName();
    User user = ShoreshTestData.outsider();
    System.runAs(new User(Id = UserInfo.getUserId())) {
      Id original = [
        SELECT Id
        FROM PermissionSet
        WHERE Name = 'Shoresh_Scheduler'
        LIMIT 1
      ]
      .Id;
      String unique = String.valueOf(Crypto.getRandomInteger())
        .replace('-', '');
      PermissionSet copy = new PermissionSet(
        Name = 'Scheduler_Without_' + unique,
        Label = 'Scheduler without ' + unique
      );
      Database.insert(copy, AccessLevel.SYSTEM_MODE);
      List<SObject> grants = new List<SObject>();
      for (ObjectPermissions each : [
        SELECT
          SobjectType,
          PermissionsRead,
          PermissionsCreate,
          PermissionsEdit,
          PermissionsDelete,
          PermissionsViewAllRecords,
          PermissionsModifyAllRecords
        FROM ObjectPermissions
        WHERE ParentId = :original
      ]) {
        ObjectPermissions grant = each.clone(false, true);
        grant.ParentId = copy.Id;
        grants.add(grant);
      }
      for (FieldPermissions each : [
        SELECT SobjectType, Field, PermissionsRead, PermissionsEdit
        FROM FieldPermissions
        WHERE ParentId = :original AND Field != :hiddenName
      ]) {
        FieldPermissions grant = each.clone(false, true);
        grant.ParentId = copy.Id;
        grants.add(grant);
      }
      grants.add(
        new PermissionSetAssignment(
          AssigneeId = user.Id,
          PermissionSetId = copy.Id
        )
      );
      Database.insert(grants, AccessLevel.SYSTEM_MODE);
    }
    return user;
  }
}
