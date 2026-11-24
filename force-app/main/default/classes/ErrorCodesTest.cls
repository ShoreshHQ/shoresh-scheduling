@IsTest
private class ErrorCodesTest {
  private static final Pattern CODE = Pattern.compile(
    '.* For support: ([ACDEFGHJKMNPQRTUVWXY34679]{3}-[ACDEFGHJKMNPQRTUVWXY34679]{3})\\.$'
  );

  private static String codeIn(String message) {
    Matcher found = CODE.matcher(message);
    Assert.isTrue(found.matches(), 'A support code ends: ' + message);
    return found.group(1);
  }

  private static List<ErrorLog__c> logsFor(String code) {
    return [
      SELECT Name, Detail__c, Person__c
      FROM ErrorLog__c
      WHERE Name = :code
      WITH SYSTEM_MODE
    ];
  }

  private static Exception unexpected() {
    try {
      List<Integer> none = new List<Integer>();
      Assert.fail('Not reached: ' + none[3]);
    } catch (Exception e) {
      return e;
    }
    return null;
  }

  // CORE-6.15: the code the person sees finds the detail, and who it happened to.
  @IsTest
  static void aProblemShoreshCantExplainShowsACodeThatFindsItsDetail() {
    Exception e = unexpected();
    Test.startTest();
    String shown = ScreenErrors.of(e).getMessage();
    Test.stopTest();
    String code = codeIn(shown);
    Assert.isTrue(
      shown.startsWith('Shoresh couldn\'t tell why. Try again. For support: ')
    );
    List<ErrorLog__c> logs = logsFor(code);
    Assert.areEqual(1, logs.size());
    Assert.isTrue(
      logs[0].Detail__c.contains('ListException'),
      logs[0].Detail__c
    );
    Assert.areEqual(UserInfo.getUserId(), logs[0].Person__c);
  }

  // CORE-6.15: a problem the person is told about another way is kept all the same.
  @IsTest
  static void aDetailWithNothingToSayIsKeptUnderACode() {
    Test.startTest();
    String code = ErrorCodes.keep('Undoing the start failed');
    String shown = ErrorCodes.said('Try again.', 'A later problem');
    Test.stopTest();
    Assert.areEqual(code, codeIn(shown), 'One code per request');
    Assert.areEqual('Undoing the start failed', logsFor(code)[0].Detail__c);
  }

  // CORE-6.15: a screen's request that can't be read says what wasn't sent, with a code.
  @IsTest
  static void aRequestThatCantBeReadSaysWhatWasntSent() {
    Test.startTest();
    String shown;
    try {
      ScreenRequests.parsed(
        '{not json',
        Map<String, Object>.class,
        'The seats'
      );
    } catch (ShoreshException e) {
      shown = e.getMessage();
    }
    Test.stopTest();
    Assert.isTrue(
      shown.startsWith('The seats could not be sent. Try again. For support: '),
      shown
    );
    Assert.isTrue(
      logsFor(codeIn(shown))[0].Detail__c.contains('JSONException'),
      'The detail is kept'
    );
  }

  // CORE-6.15: the request that went wrong is undone; its detail is still kept.
  @IsTest
  static void theDetailIsKeptWhenTheRequestIsUndone() {
    Test.startTest();
    Savepoint before = Database.setSavepoint();
    String code = codeIn(ErrorCodes.said('Try again.', 'What went wrong'));
    Database.rollback(before);
    Test.stopTest();
    Assert.areEqual('What went wrong', logsFor(code)[0].Detail__c);
  }

  // CORE-6.15: a save failing on many rows is one problem, with one code.
  @IsTest
  static void oneRequestHasOneCode() {
    Test.startTest();
    String first = codeIn(ErrorCodes.said('Try again.', 'First'));
    String second = codeIn(ErrorCodes.said('Try again.', 'Second'));
    Test.stopTest();
    Assert.areEqual(first, second);
    Assert.areEqual(
      1,
      [SELECT COUNT() FROM ErrorLog__c WITH SYSTEM_MODE],
      'Kept once'
    );
  }

  // CORE-6.15: Shoresh's own words are a reason the person can act on; no code, nothing kept.
  @IsTest
  static void shoreshsOwnWordsCarryNoCode() {
    Test.startTest();
    String shown = ScreenErrors.of(new ShoreshException('Plain words.'))
      .getMessage();
    Test.stopTest();
    Assert.areEqual('Plain words.', shown);
    Assert.areEqual(0, [SELECT COUNT() FROM ErrorLog__c WITH SYSTEM_MODE]);
  }

  // CORE-6.15: a problem a screen met on its own is kept under the code the screen showed.
  @IsTest
  static void aScreensOwnCodeIsKept() {
    Test.startTest();
    ErrorCodes.keepFromScreen('K7Q-4MX', 'Disconnected or Canceled');
    ErrorCodes.keepFromScreen('K7Q-4MX', 'Sent again: not kept twice');
    ErrorCodes.keepFromScreen('not a code', 'Ignored');
    ErrorCodes.keepFromScreen(null, 'Ignored');
    Test.stopTest();
    List<ErrorLog__c> logs = [
      SELECT Name, Detail__c
      FROM ErrorLog__c
      WITH SYSTEM_MODE
    ];
    Assert.areEqual(1, logs.size(), 'Only a real code is kept, and once');
    Assert.areEqual('K7Q-4MX', logs[0].Name);
    Assert.isTrue(logs[0].Detail__c.contains('Disconnected or Canceled'));
  }

  // CORE-6.15: codes use only letters that can't be read or heard as another.
  @IsTest
  static void codesUseOnlyClearLetters() {
    Set<String> seen = new Set<String>();
    for (Integer i = 0; i < 50; i++) {
      ErrorCodes.thisRequest = null;
      seen.add(codeIn(ErrorCodes.said('Try again.', 'Test')));
    }
    Assert.isTrue(seen.size() > 40, 'Codes differ: ' + seen.size());
  }
}
