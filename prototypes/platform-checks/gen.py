# Generates throwaway prototype metadata for the four data-model platform checks.
import os
NS='xmlns="http://soap.sforce.com/2006/04/metadata"'
B='src/main/default'
def w(p,s):
    os.makedirs(os.path.dirname(p),exist_ok=True); open(p,'w').write('<?xml version="1.0" encoding="UTF-8"?>\n'+s)
def obj(name,label,sharing='ControlledByParent'):
    w(f'{B}/objects/{name}/{name}.object-meta.xml',f'''<CustomObject {NS}>
  <deploymentStatus>Deployed</deploymentStatus>
  <label>{label}</label><pluralLabel>{label}s</pluralLabel>
  <nameField><label>{label} Name</label><type>Text</type></nameField>
  <sharingModel>{sharing}</sharingModel><externalSharingModel>{sharing}</externalSharingModel>
</CustomObject>''')
def md(o,f,target,rel):
    w(f'{B}/objects/{o}/fields/{f}.field-meta.xml',f'''<CustomField {NS}>
  <fullName>{f}</fullName><label>{f[:-3]}</label><type>MasterDetail</type>
  <referenceTo>{target}</referenceTo><relationshipName>{rel}</relationshipName>
  <relationshipOrder>0</relationshipOrder><reparentableMasterDetail>false</reparentableMasterDetail>
  <writeRequiresMasterRead>false</writeRequiresMasterRead>
</CustomField>''')
def lk(o,f,target,rel,constraint='Restrict'):
    w(f'{B}/objects/{o}/fields/{f}.field-meta.xml',f'''<CustomField {NS}>
  <fullName>{f}</fullName><label>{f[:-3]}</label><type>Lookup</type>
  <referenceTo>{target}</referenceTo><relationshipName>{rel}</relationshipName>
  <deleteConstraint>{constraint}</deleteConstraint><required>false</required>
</CustomField>''')
def txt(o,f,length=80):
    w(f'{B}/objects/{o}/fields/{f}.field-meta.xml',f'''<CustomField {NS}>
  <fullName>{f}</fullName><label>{f[:-3]}</label><type>Text</type><length>{length}</length><required>false</required>
</CustomField>''')
def longtxt(o,f):
    w(f'{B}/objects/{o}/fields/{f}.field-meta.xml',f'''<CustomField {NS}>
  <fullName>{f}</fullName><label>{f[:-3]}</label><type>LongTextArea</type><length>131072</length><visibleLines>3</visibleLines>
</CustomField>''')

obj('Camp__c','Camp','Read')
obj('Season__c','Season','Private')
for o,l in [('Program__c','Program'),('Division__c','Division'),('Group__c','Group'),('Activity__c','Activity'),
            ('ActivityEligibility__c','Activity Eligibility'),('Coverage__c','Coverage'),('ScheduleDay__c','Schedule Day')]:
    obj(o,l)
lk('Season__c','Camp__c','Camp__c','Seasons')
txt('Season__c','CampName__c')
md('Program__c','Season__c','Season__c','Programs')
md('Division__c','Program__c','Program__c','Divisions')
md('Group__c','Division__c','Division__c','Groups')
md('Activity__c','Season__c','Season__c','Activities')
md('ActivityEligibility__c','Activity__c','Activity__c','Eligibilities')
lk('ActivityEligibility__c','Group__c','Group__c','Eligibilities')
md('Coverage__c','Season__c','Season__c','Coverages')
lk('Coverage__c','Group__c','Group__c','Coverages')
md('ScheduleDay__c','Season__c','Season__c','ScheduleDays')
longtxt('ScheduleDay__c','Grid__c')

objs=['Camp__c','Season__c','Program__c','Division__c','Group__c','Activity__c','ActivityEligibility__c','Coverage__c','ScheduleDay__c']
perms=''.join(f'<objectPermissions><allowCreate>true</allowCreate><allowDelete>true</allowDelete><allowEdit>true</allowEdit><allowRead>true</allowRead><modifyAllRecords>false</modifyAllRecords><object>{o}</object><viewAllRecords>false</viewAllRecords></objectPermissions>' for o in objs)
fls=''.join(f'<fieldPermissions><editable>true</editable><field>{f}</field><readable>true</readable></fieldPermissions>' for f in ['Season__c.CampName__c','Season__c.Camp__c','ActivityEligibility__c.Group__c','Coverage__c.Group__c','ScheduleDay__c.Grid__c'])
w(f'{B}/permissionsets/Prototype_Scheduler.permissionset-meta.xml',f'<PermissionSet {NS}><label>Prototype Scheduler</label>{fls}{perms}</PermissionSet>')
for g in ['CampA_Schedulers','CampB_Schedulers']:
    w(f'{B}/groups/{g}.group-meta.xml',f'<Group {NS}><name>{g}</name><doesIncludeBosses>false</doesIncludeBosses></Group>')
w(f'{B}/sharingRules/Season__c.sharingRules-meta.xml',f'''<SharingRules {NS}>
  <sharingCriteriaRules>
    <fullName>CampA_by_text</fullName><accessLevel>Edit</accessLevel><label>Camp A by text</label>
    <sharedTo><group>CampA_Schedulers</group></sharedTo>
    <criteriaItems><field>CampName__c</field><operation>equals</operation><value>Camp A</value></criteriaItems>
    <includeRecordsOwnedByAll>true</includeRecordsOwnedByAll>
  </sharingCriteriaRules>
</SharingRules>''')
