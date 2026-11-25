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

  private static List<String> keys(List<Map<String, String>> asked) {
    List<String> all = new List<String>();
    for (Map<String, String> question : asked) {
      all.add(question.get('key'));
    }
    return all;
  }

  @IsTest
  static void questionsThatFitAreKeptAsTheyAre() {
    List<Map<String, String>> asked = questions(3, 'q');
    Assert.areEqual(JSON.serialize(asked), IncomingQuestions.fitting(asked));
  }

  // API-6.7: questions past what an import holds end in one that says more couldn't be kept; a
  // later batch joining it, even the same questions sent again, keeps that one line as it is.
  @IsTest
  static void questionsThatDontFitEndInOneThatSaysSo() {
    String text = IncomingQuestions.fitting(questions(1000, 'q'));
    Assert.isTrue(text.length() <= 131072, 'fits Open__c');
    List<Map<String, String>> kept = read(text);
    Assert.isTrue(kept.size() < 1000);
    Assert.areEqual(
      'More questions from this system couldn\'t be kept here.',
      kept[kept.size() - 1].get('title')
    );
    Assert.isTrue(
      IncomingQuestions.isBatch(text),
      'still a batch\'s questions'
    );

    List<Map<String, String>> resent = kept.clone();
    resent.addAll(questions(1000, 'q'));
    Assert.areEqual(
      keys(kept),
      keys(read(IncomingQuestions.fitting(resent))),
      'sent again'
    );

    List<Map<String, String>> answered = new List<Map<String, String>>{
      kept[kept.size() - 1]
    };
    String after = IncomingQuestions.fitting(answered);
    Assert.areEqual(1, read(after).size(), 'the line stays once room is made');
  }
}
