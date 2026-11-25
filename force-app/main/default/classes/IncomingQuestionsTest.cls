/**
 * IncomingQuestions.fitting: a batch's questions kept on its import (Import__c.Open__c; API-6.7).
 */
@IsTest
private class IncomingQuestionsTest {
  private static List<Map<String, String>> questions(
    Integer count,
    String tag
  ) {
    List<Map<String, String>> asked = new List<Map<String, String>>();
    for (Integer i = 0; i < count; i++) {
      asked.add(
        new Map<String, String>{
          'key' => IncomingBatch.QUESTION_PREFIX +
          tag +
          i,
          'title' => 'Which camper is this? '.repeat(13)
        }
      );
    }
    return asked;
  }

  private static List<Map<String, String>> read(String text) {
    return (List<Map<String, String>>) JSON.deserialize(
      text,
      List<Map<String, String>>.class
    );
  }

  @IsTest
  static void questionsThatFitAreKeptAsTheyAre() {
    List<Map<String, String>> asked = questions(3, 'q');
    Assert.areEqual(JSON.serialize(asked), IncomingQuestions.fitting(asked));
  }

  // API-6.7: questions past what an import holds end in one that says how many more there are,
  // and a later batch joining it adds its own left-out questions to that count.
  @IsTest
  static void questionsThatDontFitAreCountedInALastQuestion() {
    String text = IncomingQuestions.fitting(questions(1000, 'q'));
    Assert.isTrue(text.length() <= 131072, 'fits Open__c');
    List<Map<String, String>> kept = read(text);
    Map<String, String> last = kept[kept.size() - 1];
    Integer more = 1000 - (kept.size() - 1);
    Assert.isTrue(more > 0);
    Assert.areEqual(
      more + ' more questions from this system couldn\'t be kept here.',
      last.get('title')
    );
    Assert.isTrue(
      IncomingQuestions.isBatch(text),
      'still a batch\'s questions'
    );

    kept.addAll(questions(10, 'later'));
    List<Map<String, String>> joined = read(IncomingQuestions.fitting(kept));
    Assert.areEqual(kept.size() - 10, joined.size(), 'one count, not two');
    Assert.areEqual(
      (more + 10) + ' more questions from this system couldn\'t be kept here.',
      joined[joined.size() - 1].get('title')
    );
  }
}
