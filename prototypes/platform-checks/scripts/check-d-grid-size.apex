// Check (d): does one day's grid for 100 groups x 14 blocks fit a 131,072-character long text field,
// and does the split rule work when a day is too big?
// Worst case on purpose: every cell filled, 3-digit local numbers, flags on every cell.
Integer LIMIT_CHARS = 131072;
Integer SPLIT_AT = 100000; // split rule: keep every part under 100,000 characters (headroom for format growth)

// Compact format v1: {"v":1,"g":[[groupNo,[[activityNo,locationNo,flags],...14 blocks]],...]}
String compact(Integer groups, Integer blocks) {
    List<Object> rows = new List<Object>();
    for (Integer g = 0; g < groups; g++) {
        List<Object> cells = new List<Object>();
        for (Integer b = 0; b < blocks; b++) cells.add(new List<Integer>{ 900 + Math.mod(g * blocks + b, 99), 800 + Math.mod(b, 99), 7 });
        rows.add(new List<Object>{ 100 + g, cells });
    }
    return JSON.serialize(new Map<String, Object>{ 'v' => 1, 'g' => rows });
}
// Verbose format (keys spelled out): a pessimistic upper bound if the format gains fields.
String verbose(Integer groups, Integer blocks) {
    List<Object> rows = new List<Object>();
    for (Integer g = 0; g < groups; g++) {
        List<Object> cells = new List<Object>();
        for (Integer b = 0; b < blocks; b++) cells.add(new Map<String, Object>{ 'activity' => 900 + b, 'location' => 800 + b, 'locked' => true, 'manual' => true, 'kind' => 'Activity' });
        rows.add(new Map<String, Object>{ 'group' => 100 + g, 'cells' => cells });
    }
    return JSON.serialize(new Map<String, Object>{ 'formatVersion' => 1, 'groups' => rows });
}
// Split rule: whole groups only, in order, each part's JSON under SPLIT_AT.
List<String> split(String grid) {
    Map<String, Object> root = (Map<String, Object>) JSON.deserializeUntyped(grid);
    String key = root.containsKey('g') ? 'g' : 'groups';
    List<Object> rows = (List<Object>) root.get(key);
    List<String> parts = new List<String>();
    List<Object> current = new List<Object>();
    Integer size = 0;
    for (Object row : rows) {
        Integer rowSize = JSON.serialize(row).length() + 1;
        if (!current.isEmpty() && size + rowSize > SPLIT_AT) {
            parts.add(JSON.serialize(new Map<String, Object>{ 'v' => 1, key => current }));
            current = new List<Object>();
            size = 0;
        }
        current.add(row);
        size += rowSize;
    }
    parts.add(JSON.serialize(new Map<String, Object>{ 'v' => 1, key => current }));
    return parts;
}

Camp__c camp = new Camp__c(Name = 'Grid Camp');
insert camp;
Season__c season = new Season__c(Name = 'Grid Season', Camp__c = camp.Id);
insert season;
Savepoint sp = Database.setSavepoint();

String c100 = compact(100, 14);
System.debug(LoggingLevel.ERROR, 'RESULT ' + 'D1 compact, 100 groups x 14 blocks: ' + c100.length() + ' chars (' + (100 * c100.length() / LIMIT_CHARS) + '% of limit)');
ScheduleDay__c day = new ScheduleDay__c(Name = 'Mon', Season__c = season.Id, Grid__c = c100);
insert day;
System.debug(LoggingLevel.ERROR, 'RESULT ' + 'D2 saved and read back intact: ' + ([SELECT Grid__c FROM ScheduleDay__c WHERE Id = :day.Id].Grid__c == c100));
String v100 = verbose(100, 14);
System.debug(LoggingLevel.ERROR, 'RESULT ' + 'D3 verbose upper bound, 100 x 14: ' + v100.length() + ' chars, fits=' + (v100.length() <= LIMIT_CHARS));
Integer perGroup = (compact(101, 14).length() - c100.length());
System.debug(LoggingLevel.ERROR, 'RESULT ' + 'D4 each extra group adds ' + perGroup + ' chars; one record holds about ' + ((LIMIT_CHARS - 20) / perGroup) + ' groups x 14 blocks');

// Field limit is exact: 131,072 saves, 131,073 is refused.
try { insert new ScheduleDay__c(Name = 'max', Season__c = season.Id, Grid__c = 'x'.repeat(LIMIT_CHARS)); System.debug(LoggingLevel.ERROR, 'RESULT ' + 'D5 131,072 chars: saved'); }
catch (Exception e) { System.debug(LoggingLevel.ERROR, 'RESULT ' + 'D5 131,072 chars: refused ' + e.getMessage().left(90)); }
try { insert new ScheduleDay__c(Name = 'over', Season__c = season.Id, Grid__c = 'x'.repeat(LIMIT_CHARS + 1)); System.debug(LoggingLevel.ERROR, 'RESULT ' + 'D6 131,073 chars: saved (unexpected)'); }
catch (Exception e) { System.debug(LoggingLevel.ERROR, 'RESULT ' + 'D6 131,073 chars: refused, ' + e.getMessage().left(90)); }

// Split: a camp too big for one record (verbose format, 150 groups) splits into whole-group parts and reassembles.
String big = verbose(150, 14);
List<String> parts = split(big);
List<ScheduleDay__c> partRecs = new List<ScheduleDay__c>();
Integer maxPart = 0;
for (String p : parts) { partRecs.add(new ScheduleDay__c(Name = 'part', Season__c = season.Id, Grid__c = p)); maxPart = Math.max(maxPart, p.length()); }
insert partRecs;
List<Object> joined = new List<Object>();
for (ScheduleDay__c r : [SELECT Grid__c FROM ScheduleDay__c WHERE Id IN :partRecs ORDER BY Id]) {
    joined.addAll((List<Object>) ((Map<String, Object>) JSON.deserializeUntyped(r.Grid__c)).get('groups'));
}
List<Object> original = (List<Object>) ((Map<String, Object>) JSON.deserializeUntyped(big)).get('groups');
// Compare group order and every cell value (map key order is not significant in JSON).
Boolean same = joined.size() == original.size();
for (Integer i = 0; same && i < original.size(); i++) {
    Map<String, Object> a = (Map<String, Object>) joined[i];
    Map<String, Object> o = (Map<String, Object>) original[i];
    same = a.get('group') == o.get('group') && ((List<Object>) a.get('cells')).size() == ((List<Object>) o.get('cells')).size();
    for (Integer c = 0; same && c < ((List<Object>) o.get('cells')).size(); c++) {
        same = ((Map<String, Object>) ((List<Object>) a.get('cells'))[c]) == ((Map<String, Object>) ((List<Object>) o.get('cells'))[c]);
    }
}
System.debug(LoggingLevel.ERROR, 'RESULT ' + 'D7 split: ' + big.length() + ' chars -> ' + parts.size() + ' parts, largest ' + maxPart + ' chars; ' + original.size() + ' groups in, ' + joined.size() + ' out; every group and cell identical and in order: ' + same);
System.debug(LoggingLevel.ERROR, 'RESULT ' + 'D8 CPU ms used: ' + Limits.getCpuTime() + ' of ' + Limits.getLimitCpuTime() + '; heap ' + Limits.getHeapSize() + ' of ' + Limits.getLimitHeapSize());
Database.rollback(sp);
delete season;
delete camp;
