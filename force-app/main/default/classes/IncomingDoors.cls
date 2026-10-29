/**
 * The two doors into each incoming capability today (repo ADR 0024 choice 3; API-1.3): a Flow
 * action and a web address. Both hand the same records to the same capability (IncomingBatch),
 * so the same data gives the same result; only how the answer travels differs. A CSV file comes
 * later, through the same capability.
 *
 * The web address takes {"records": [ {...}, ... ]}, each record's fields by their plain names,
 * and answers {"saved": n, "unchanged": n, "problems": n, "records": [{row, result, message}]}.
 * Whatever goes wrong is said in Shoresh's words (ScreenErrors), never the platform's.
 */
public with sharing class IncomingDoors {
  // The web address's record type and its fields' plain names, while it reads a body.
  private static System.Type recordType;
  private static Set<String> fields;

  /** The Flow action: any number of records, taken 200 at a time, each answered. */
  public static List<IncomingResult> byFlow(
    IncomingBatch.Capability capability,
    List<Object> records
  ) {
    List<IncomingResult> answers = new List<IncomingResult>();
    if (records == null) {
      return answers;
    }
    for (
      Integer start = 0; start < records.size(); start += IncomingBatch.MOST
    ) {
      List<Object> part = new List<Object>();
      for (
        Integer i = start;
        i < Math.min(start + IncomingBatch.MOST, records.size());
        i++
      ) {
        part.add(records[i]);
      }
      List<IncomingResult> partAnswers;
      try {
        partAnswers = IncomingBatch.run(
          capability,
          part,
          new Map<Integer, String>()
        );
      } catch (Exception e) {
        partAnswers = allRefused(part.size(), messageOf(e));
      }
      for (IncomingResult answer : partAnswers) {
        answer.row += start;
        answers.add(answer);
      }
    }
    return answers;
  }

  /** The web address: reads the body, runs the batch, writes the answer. */
  public static void byWeb(
    IncomingBatch.Capability capability,
    System.Type typeOfRecord,
    Set<String> fieldNames
  ) {
    recordType = typeOfRecord;
    fields = fieldNames;
    RestResponse response = RestContext.response;
    response.addHeader('Content-Type', 'application/json');
    try {
      List<Object> sent = recordsIn(RestContext.request.requestBody);
      if (sent.size() > IncomingBatch.MOST) {
        refuse(
          response,
          400,
          'A batch can carry at most ' +
            IncomingBatch.MOST +
            ' records. Send these in smaller batches.'
        );
        return;
      }
      List<Object> records = new List<Object>();
      Map<Integer, String> unreadable = new Map<Integer, String>();
      for (Integer i = 0; i < sent.size(); i++) {
        try {
          records.add(read(sent[i]));
        } catch (UnreadableException e) {
          records.add(null);
          unreadable.put(i, e.getMessage());
        }
      }
      List<IncomingResult> answers = IncomingBatch.run(
        capability,
        records,
        unreadable
      );
      response.statusCode = 200;
      response.responseBody = Blob.valueOf(JSON.serialize(answer(answers)));
    } catch (IncomingBatch.NoAccessException e) {
      refuse(response, 403, e.getMessage());
    } catch (Exception e) {
      Boolean ours =
        e instanceof IncomingBatch.RefusedException ||
        e instanceof ShoreshException;
      refuse(response, ours ? 400 : 500, messageOf(e));
    }
  }

  /** {"records": [...]} as a list; anything else is refused in plain words. */
  private static List<Object> recordsIn(Blob body) {
    Object parsed;
    try {
      parsed = body == null ? null : JSON.deserializeUntyped(body.toString());
    } catch (JSONException e) {
      parsed = null;
    }
    Object records = parsed instanceof Map<String, Object>
      ? ((Map<String, Object>) parsed).get('records')
      : null;
    if (!(records instanceof List<Object>)) {
      throw new IncomingBatch.RefusedException(
        'Send JSON like {"records": [ { ... }, { ... } ]}.'
      );
    }
    return (List<Object>) records;
  }

  /** A record Shoresh can't read, with why. */
  private class UnreadableException extends Exception {
  }

  /** One record as its capability's type; refused with why (a field Shoresh doesn't know...). */
  private static Object read(Object sent) {
    if (!(sent instanceof Map<String, Object>)) {
      throw new UnreadableException('Each record is a set of fields in { }.');
    }
    Map<String, Object> given = (Map<String, Object>) sent;
    for (String name : given.keySet()) {
      if (!fields.contains(name)) {
        List<String> known = new List<String>(fields);
        known.sort();
        throw new UnreadableException(
          'Shoresh doesn\'t know the field "' +
            name.left(40) +
            '". The fields are: ' +
            String.join(known, ', ') +
            '.'
        );
      }
    }
    try {
      return JSON.deserializeStrict(JSON.serialize(given), recordType);
    } catch (Exception e) {
      throw new UnreadableException(
        'A value is the wrong kind: names and IDs are text, true or false is true or false, and a time is like 2026-07-01T09:30:00Z.'
      );
    }
  }

  private static Map<String, Object> answer(List<IncomingResult> answers) {
    Map<String, Integer> counts = new Map<String, Integer>{
      IncomingBatch.SAVED => 0,
      IncomingBatch.UNCHANGED => 0,
      IncomingBatch.PROBLEM => 0
    };
    for (IncomingResult item : answers) {
      counts.put(item.result, counts.get(item.result) + 1);
    }
    return new Map<String, Object>{
      'saved' => counts.get(IncomingBatch.SAVED),
      'unchanged' => counts.get(IncomingBatch.UNCHANGED),
      'problems' => counts.get(IncomingBatch.PROBLEM),
      'records' => answers
    };
  }

  private static void refuse(
    RestResponse response,
    Integer status,
    String message
  ) {
    response.statusCode = status;
    response.responseBody = Blob.valueOf(
      JSON.serialize(new Map<String, String>{ 'message' => message })
    );
  }

  private static List<IncomingResult> allRefused(Integer size, String message) {
    List<IncomingResult> answers = new List<IncomingResult>();
    for (Integer i = 0; i < size; i++) {
      IncomingResult answer = new IncomingResult();
      answer.row = i + 1;
      answer.result = IncomingBatch.PROBLEM;
      answer.message = message;
      answers.add(answer);
    }
    return answers;
  }

  /** Shoresh's own words as they are; anything else as ScreenErrors says it. */
  private static String messageOf(Exception e) {
    if (
      e instanceof IncomingBatch.RefusedException ||
      e instanceof IncomingBatch.NoAccessException ||
      e instanceof ShoreshException
    ) {
      return e.getMessage();
    }
    return ScreenErrors.of(e).getMessage();
  }
}
