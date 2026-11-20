/**
 * The shared new-row examples (staticresources/ShoreshNewRowExamples.json), which the screens must
 * also pass (shoreshNewRows newRowExamples.test.js): the server starts a new location or activity
 * with what the screens start it with (Greg, 2026-10-16).
 */
@IsTest
private class NewRowExamplesTest {
  private static List<Object> rows() {
    String ours = ShoreshSchema.namespace();
    StaticResource read = [
      SELECT Body
      FROM StaticResource
      WHERE Name = 'ShoreshNewRowExamples' AND NamespacePrefix = :ours
      LIMIT 1
    ];
    return (List<Object>) ((Map<String, Object>) JSON.deserializeUntyped(
        read.Body.toString()
      ))
      .get('rows');
  }

  @IsTest
  static void aNewRowStartsAsTheScreensStartIt() {
    List<Object> rows = rows();
    Assert.isFalse(rows.isEmpty());
    for (Object each : rows) {
      Map<String, Object> example = (Map<String, Object>) each;
      String kind = (String) example.get('kind');
      SObject row;
      if (kind == 'Location') {
        row = new Location__c();
      } else {
        row = new Activity__c();
      }
      AgentSetupNewRow.startsWith(kind, row);
      // Each field by its local name, as the examples write it; numbers as text (1 and 1.0).
      Map<String, String> started = new Map<String, String>();
      for (Schema.SObjectField field : ShoreshSchema.populatedFields(row)) {
        started.put(
          ShoreshSchema.localName(field),
          String.valueOf(row.get(field))
        );
      }
      Map<String, String> expected = new Map<String, String>();
      Map<String, Object> fields = (Map<String, Object>) example.get('fields');
      for (String name : fields.keySet()) {
        expected.put(name, String.valueOf(fields.get(name)));
      }
      Assert.areEqual(expected, started, kind);
    }
  }
}
