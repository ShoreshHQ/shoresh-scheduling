/**
 * The one place Apex turns object and field names written as text into the platform's own
 * references, so nothing breaks when the package gets its namespace (`shoresh__`). From then on
 * Salesforce names every custom field `shoresh__Field__c` in getName(), describe maps and
 * getPopulatedFieldsAsMap() keys, while typed references (Week__c.StartDate__c) keep working.
 *
 * - Compare fields as tokens, never as names: resolve any name with field() first.
 * - Keep names that are stored (an import's log) as localName(): the same before and after.
 * - Build dynamic SOQL with queryName() and childRelationship(), never with written names.
 *
 * scripts/namespace-safety.js counts names written as text elsewhere; CI fails if any file
 * gains one.
 */
public with sharing class ShoreshSchema {
  /** Tests set this to 'shoresh__' to see names the way the namespaced package will. */
  @TestVisible
  private static String simulatedPrefix;
  private static Map<Schema.SObjectType, Map<String, Schema.SObjectField>> fieldsByLocalName = new Map<Schema.SObjectType, Map<String, Schema.SObjectField>>();

  /** What Salesforce puts before this package's names: '' today, 'shoresh__' once it has one. */
  public static String prefix() {
    if (simulatedPrefix != null) {
      return simulatedPrefix;
    }
    Schema.DescribeSObjectResult camp = Camp__c.SObjectType.getDescribe(
      SObjectDescribeOptions.DEFERRED
    );
    return camp.getName().removeEnd(camp.getLocalName());
  }

  /**
   * The object's field with this name, written with or without the prefix, in any case; null
   * when the object has no such field (including a name from another namespace).
   */
  public static Schema.SObjectField field(
    Schema.SObjectType type,
    String name
  ) {
    if (type == null || String.isBlank(name)) {
      return null;
    }
    String key = name.toLowerCase();
    String own = prefix().toLowerCase();
    if (own != '' && key.startsWith(own)) {
      key = key.removeStart(own);
    }
    return localFields(type).get(key);
  }

  /** The field's name without the prefix ("StartDate__c"): how stored names are kept. */
  public static String localName(Schema.SObjectField field) {
    return field.getDescribe().getLocalName();
  }

  /** The object's name without the prefix ("Week__c"). */
  public static String localName(Schema.SObjectType type) {
    return type.getDescribe(SObjectDescribeOptions.DEFERRED).getLocalName();
  }

  /** The field's full name for dynamic SOQL (prefix included once there is one). */
  public static String queryName(Schema.SObjectField field) {
    return field.getDescribe().getName();
  }

  /** The object's full name for dynamic SOQL. */
  public static String queryName(Schema.SObjectType type) {
    return type.getDescribe(SObjectDescribeOptions.DEFERRED).getName();
  }

  /**
   * The name of the parent's list of child rows that point at it through this field, for a
   * subquery ("Eligibilities__r" for ActivityEligibility__c.Activity__c); null if none.
   */
  public static String childRelationship(
    Schema.SObjectType parent,
    Schema.SObjectField childField
  ) {
    for (
      Schema.ChildRelationship child : parent.getDescribe(
          SObjectDescribeOptions.DEFERRED
        )
        .getChildRelationships()
    ) {
      if (child.getField() == childField) {
        return child.getRelationshipName();
      }
    }
    return null;
  }

  /**
   * The name the namespaced package will report for a field (getPopulatedFieldsAsMap() keys):
   * custom fields get the prefix, standard ones don't. For tests, with simulatedPrefix set.
   */
  @TestVisible
  private static String packagedName(Schema.SObjectField field) {
    Schema.DescribeFieldResult described = field.getDescribe();
    return described.isCustom()
      ? prefix() + described.getLocalName()
      : described.getLocalName();
  }

  private static Map<String, Schema.SObjectField> localFields(
    Schema.SObjectType type
  ) {
    Map<String, Schema.SObjectField> byName = fieldsByLocalName.get(type);
    if (byName == null) {
      byName = new Map<String, Schema.SObjectField>();
      for (
        Schema.SObjectField each : type.getDescribe(
            SObjectDescribeOptions.DEFERRED
          )
          .fields.getMap()
          .values()
      ) {
        byName.put(each.getDescribe().getLocalName().toLowerCase(), each);
      }
      fieldsByLocalName.put(type, byName);
    }
    return byName;
  }
}
