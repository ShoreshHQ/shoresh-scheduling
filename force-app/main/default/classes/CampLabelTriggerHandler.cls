/** Camp labels: fills the hidden key (camp + model term) so a camp has one label per term. */
public with sharing class CampLabelTriggerHandler {
  /** Before a save: keys and checks (beforeSave). After a delete: camp words read are forgotten. */
  public static void handle(
    System.TriggerOperation operation,
    List<CampLabel__c> labels
  ) {
    if (operation == System.TriggerOperation.AFTER_DELETE) {
      CampLabels.forget();
    } else {
      beforeSave(labels);
    }
  }

  public static void beforeSave(List<CampLabel__c> labels) {
    // Camp words read earlier in this request are out of date now.
    CampLabels.forget();
    Set<Id> campIds = new Set<Id>();
    for (CampLabel__c label : labels) {
      label.Key__c = label.Camp__c + '|' + label.ModelTerm__c;
      campIds.add(label.Camp__c);
    }
    Set<Id> savingIds = new Set<Id>();
    for (CampLabel__c label : labels) {
      if (label.Id != null) {
        savingIds.add(label.Id);
      }
    }
    Set<String> taken = new Set<String>();
    for (CampLabel__c existing : [
      SELECT Id, Camp__c, ModelTerm__c
      FROM CampLabel__c
      WHERE Camp__c IN :campIds AND Id NOT IN :savingIds
      WITH SYSTEM_MODE
    ]) {
      taken.add(existing.Camp__c + '|' + existing.ModelTerm__c);
    }
    for (CampLabel__c label : labels) {
      if (!taken.add(label.Key__c)) {
        label.ModelTerm__c.addError(
          'This camp already has its own word for this term. Change that one instead.'
        );
      }
    }
  }
}
