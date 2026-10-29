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
 * Names written as text anywhere else fail CI (scripts/namespace-safety.js allows none; see
 * docs/adr/0009-namespace-safe-names.md).
 */
public with sharing class ShoreshSchema {
  /** Tests set this to 'shoresh__' to see names the way the namespaced package will. */
  @TestVisible
  private static String simulatedPrefix;
  private static String realPrefix;
  private static Map<Schema.SObjectType, Map<String, Schema.SObjectField>> fieldsByLocalName = new Map<Schema.SObjectType, Map<String, Schema.SObjectField>>();
  // Imports and Undo ask for the same fields' names row after row.
  private static Map<Schema.SObjectField, String> localNames = new Map<Schema.SObjectField, String>();

  /** What Salesforce puts before this package's names: '' today, 'shoresh__' once it has one. */
  public static String prefix() {
    return simulatedPrefix != null ? simulatedPrefix : realPrefix();
  }

  /** The package's namespace as the platform names it ("shoresh"), or null before it has one. */
  public static String namespace() {
    String real = realPrefix().removeEnd('__');
    return String.isBlank(real) ? null : real;
  }

  /** The org's real prefix for this package (simulating never changes what the org has). */
  private static String realPrefix() {
    if (realPrefix == null) {
      Schema.DescribeSObjectResult camp = Camp__c.SObjectType.getDescribe(
        SObjectDescribeOptions.DEFERRED
      );
      realPrefix = camp.getName().removeEnd(camp.getLocalName());
    }
    return realPrefix;
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
    return localFields(type).get(withoutPrefix(name).toLowerCase());
  }

  /**
   * A name with this package's prefix taken off, if it has it (any case): how a name read from
   * a log or the screen is compared with a local name. Other text comes back as it is.
   */
  public static String withoutPrefix(String name) {
    String own = prefix();
    if (
      name != null &&
      own != '' &&
      name.toLowerCase().startsWith(own.toLowerCase())
    ) {
      return name.substring(own.length());
    }
    return name;
  }

  /**
   * The fields a record was given (sent from a screen, or set in code), its Id left out. Rows
   * report them with the prefix once there is one; each is turned into its field here.
   */
  public static Set<Schema.SObjectField> populatedFields(SObject record) {
    Schema.SObjectType type = record.getSObjectType();
    Set<Schema.SObjectField> result = new Set<Schema.SObjectField>();
    for (String reported : record.getPopulatedFieldsAsMap().keySet()) {
      Schema.SObjectField found = field(type, reported);
      if (reported != 'Id' && found != null) {
        result.add(found);
      }
    }
    return result;
  }

  /** The field's name without the prefix ("StartDate__c"): how stored names are kept. */
  public static String localName(Schema.SObjectField field) {
    String name = localNames.get(field);
    if (name == null) {
      name = field.getDescribe().getLocalName();
      localNames.put(field, name);
    }
    return name;
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
   * subquery ("Eligibilities__r" for ActivityEligibility__c.Activity__c). A field that doesn't
   * point at the parent is Shoresh's own mistake: refused plainly, never sent as a query.
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
    throw new ShoreshException(
      'Shoresh could not read how its records fit together. Nothing was changed. Please tell Shoresh support.'
    );
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
        // Only this package's own custom fields and standard fields: in a customer's org, a
        // field they (or another package) add can share a local name with ours.
        Schema.DescribeFieldResult described = each.getDescribe();
        if (
          !described.isCustom() ||
          isOwn(described.getName(), described.getLocalName(), realPrefix())
        ) {
          byName.put(described.getLocalName().toLowerCase(), each);
        }
      }
      fieldsByLocalName.put(type, byName);
    }
    return byName;
  }

  /**
   * Whether a custom field is this package's own: its full name is exactly the package's prefix
   * and its local name. A customer's own StartDate__c on our object, or another package's, is not.
   */
  @TestVisible
  private static Boolean isOwn(
    String fullName,
    String localName,
    String packagePrefix
  ) {
    return fullName == packagePrefix + localName;
  }
}
