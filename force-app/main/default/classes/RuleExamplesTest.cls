/**
 * The shared rule examples (staticresources/ShoreshRuleExamples.json), which the screens' code must
 * also pass (shoreshImportEngine ruleExamples.test.js), so the two can't drift apart.
 */
@IsTest
private class RuleExamplesTest {
  private static Map<String, Object> examples() {
    String ours = ShoreshSchema.namespace();
    StaticResource found = [
      SELECT Body
      FROM StaticResource
      WHERE Name = 'ShoreshRuleExamples' AND NamespacePrefix = :ours
      LIMIT 1
    ];
    return (Map<String, Object>) JSON.deserializeUntyped(found.Body.toString());
  }

  private static List<String> texts(Object values) {
    List<String> out = new List<String>();
    for (Object each : (List<Object>) values) {
      out.add((String) each);
    }
    return out;
  }

  // INGEST-2.2
  @IsTest
  static void namesFoldAsTheImportFoldsThem() {
    List<Object> cases = (List<Object>) examples().get('foldedNames');
    Assert.isFalse(cases.isEmpty());
    for (Object each : cases) {
      Map<String, Object> example = (Map<String, Object>) each;
      Assert.areEqual(
        (String) example.get('fold'),
        ChoicesImport.fold((String) example.get('name'))
      );
    }
  }

  // MEMO-4.2
  @IsTest
  static void aDeletedLinkedChoiceIsRememberedByTheNameTheImportLooksFor() {
    List<Object> cases = (List<Object>) examples().get('deletedLinkedChoices');
    Assert.isFalse(cases.isEmpty());
    for (Object each : cases) {
      Map<String, Object> example = (Map<String, Object>) each;
      Assert.areEqual(
        (String) example.get('name'),
        SetupDeletionElectives.linkedChoiceName(
          (String) example.get('activity'),
          texts(example.get('days')),
          texts(example.get('blocks'))
        )
      );
    }
  }

  // MEMO-4.4
  @IsTest
  static void aLearnedAnswerIsChangedOnlyToWhatTheScreenOffers() {
    List<Object> cases = (List<Object>) examples().get('learnedChoices');
    Assert.isFalse(cases.isEmpty());
    for (Object each : cases) {
      Map<String, Object> example = (Map<String, Object>) each;
      String question = (String) example.get('question');
      List<String> answers = texts(example.get('answers'));
      Set<String> allowed = LearnedChoices.allowed(question);
      Assert.areEqual(
        new Set<String>(answers),
        allowed ?? new Set<String>(),
        question
      );
      for (String answer : answers) {
        Assert.isTrue(LearnedChoices.allows(question, answer), question);
      }
    }
  }
}
