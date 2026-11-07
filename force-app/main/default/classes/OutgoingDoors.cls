/**
 * The three doors out of each outgoing capability (repo ADR 0024 choices 2 and 3; API-1.3): a
 * web address an outside system reads with a key, a Flow action that sends to a destination the
 * camp saved, and CSV through either. All three take the same rows from the capability's one
 * piece of logic (rows()), so the same data gives the same result.
 *
 * - Web address: GET /v1/<plain_name>?season=Summer 2026&week=Week 2 (format=csv for a file).
 *   Answers {"season", "week", "records": [ {...} ]}, each record's fields by their plain names.
 *   Only a key holding the capability's "Read ..." permission set gets an answer (API-4.4).
 * - Flow action send_<thing>, to_system = the name of a Named Credential the camp made: the same
 *   records are posted there as JSON (or CSV). A camp's own Flow decides when (on publish, on
 *   Finalize, every morning) and where. Each send is kept (Send__c) and a failed one shows on
 *   Settings (API-6.3).
 */
public with sharing class OutgoingDoors {
  public static final String CSV = 'csv';
  // Each season's first day for saying "Day 3", or null when its days are named (WEEK-1.7).
  private static final Map<Id, Integer> FIRST_DAYS = new Map<Id, Integer>();
  // Salesforce allows 100 sends to other systems in one go.
  private static final Integer MOST_SENDS = 100;
  // A Named Credential's name: letters, numbers and single underscores, starting with a letter.
  private static final Pattern NAMED_CREDENTIAL = Pattern.compile(
    '^[A-Za-z](_?[A-Za-z0-9])*$'
  );

  /** One outgoing capability: its name, access and the one piece of logic giving its rows. */
  public interface Capability {
    /** The plain name: group_schedule, so /v1/group_schedule and send_group_schedule. */
    String name();
    /** "the group schedule", for sentences. */
    String what();
    String permissionSet();
    String permissionLabel();
    /** The record's fields by their plain names, in the order a CSV file has them. */
    List<String> fields();
    /** The rows for the season's named week (a ShoreshException says why there are none). */
    List<Map<String, Object>> rows(Season__c season, String week);
  }

  // ---------------------------------------------------------------- the web address

  /** The web address: reads season, week and format, answers the records. */
  public static void byWeb(Capability capability) {
    RestRequest request = RestContext.request;
    RestResponse response = RestContext.response;
    String season = request.params.get('season');
    String week = request.params.get('week');
    Boolean asCsv = CSV.equalsIgnoreCase(request.params.get('format'));
    try {
      if (!IncomingBatch.holds(capability.permissionSet())) {
        refuse(
          response,
          403,
          'This user can\'t read ' +
            capability.what() +
            '. A Salesforce admin can give it the "' +
            capability.permissionLabel() +
            '" permission set.'
        );
        return;
      }
      Season__c found = OutgoingRows.seasonCalled(season);
      List<Map<String, Object>> rows = rowsOf(capability, found, week);
      response.statusCode = 200;
      if (asCsv) {
        response.addHeader('Content-Type', 'text/csv');
        response.responseBody = Blob.valueOf(
          OutgoingRows.csvOf(fieldsOf(capability, found), rows)
        );
      } else {
        response.addHeader('Content-Type', 'application/json');
        response.responseBody = Blob.valueOf(
          JSON.serialize(
            new Map<String, Object>{
              'season' => found.Name,
              'week' => week,
              'records' => rows
            }
          )
        );
      }
    } catch (ShoreshException e) {
      refuse(response, 400, e.getMessage());
    } catch (Exception e) {
      refuse(response, 500, ScreenErrors.of(e).getMessage());
    }
  }

  private static void refuse(
    RestResponse response,
    Integer status,
    String message
  ) {
    response.statusCode = status;
    response.addHeader('Content-Type', 'application/json');
    response.responseBody = Blob.valueOf(
      JSON.serialize(OutgoingRows.answered(message))
    );
  }

  /**
   * The capability's rows. In a numbered-days season each record with a date also says its day,
   * "Day 3" (WEEK-1.7), added to what it had (a CSV file's last column), so what already reads it
   * reads the same; a named season's records are as they always were.
   */
  private static List<Map<String, Object>> rowsOf(
    Capability capability,
    Season__c season,
    String week
  ) {
    List<Map<String, Object>> rows = capability.rows(season, week);
    if (numbered(capability, season)) {
      Integer firstDay = FIRST_DAYS.get(season.Id);
      for (Map<String, Object> row : rows) {
        // A seat may have no date: then it has no day either.
        String day = (String) row.get('date');
        row.put(
          'day',
          String.isBlank(day) || day == 'null'
            ? null
            : DayWords.sayNumbered(Date.valueOf(day), firstDay)
        );
      }
    }
    return rows;
  }

  /** The fields in a CSV file's order: day last in a numbered-days season. */
  private static List<String> fieldsOf(
    Capability capability,
    Season__c season
  ) {
    List<String> fields = capability.fields().clone();
    if (numbered(capability, season)) {
      fields.add('day');
    }
    return fields;
  }

  private static Boolean numbered(Capability capability, Season__c season) {
    if (!capability.fields().contains('date')) {
      return false;
    }
    if (!FIRST_DAYS.containsKey(season.Id)) {
      FIRST_DAYS.put(season.Id, DayWords.firstDayGoingOut(season.Id));
    }
    return FIRST_DAYS.get(season.Id) != null;
  }

  // ---------------------------------------------------------------- the Flow action

  /** One send a Flow asks for. */
  public class Send {
    public String toSystem;
    public String season;
    public String week;
    public Boolean asCsv;
  }

  /**
   * The Flow action: each send's records read now, as this user, and posted to its destination
   * just after (SendLog), where every send is kept. What can be told now is answered now.
   */
  public static List<OutgoingResult> bySend(
    Capability capability,
    List<Send> sends
  ) {
    Sender sender = new Sender(capability);
    List<OutgoingResult> results = new List<OutgoingResult>();
    List<Send__c> kept = new List<Send__c>();
    for (Send each : sends) {
      Send__c log = new Send__c(
        System__c = String.isBlank(each.toSystem)
          ? null
          : each.toSystem.left(80),
        What__c = (capability.what() +
          (String.isBlank(each.week)
            ? ''
            : ' for ' + each.week.normalizeSpace()))
          .left(255)
      );
      OutgoingResult result = sender.send(each, log);
      results.add(result);
      // A send on its way is kept with its post. One refused now is kept as it is, unless no
      // season was found: then it has nowhere on a screen to show, and its Flow is told.
      if (!result.sent && log.Season__c != null) {
        kept.add(log);
      }
    }
    SendLog.deliver(kept, sender.deliveries);
    return results;
  }

  /**
   * One Flow action's sends: the permission set checked once, and each season and week read once
   * however many destinations they go to, so a big batch stays within Salesforce's limits.
   */
  private class Sender {
    private Capability capability;
    private Boolean allowed;
    private Integer made = 0;
    private Map<String, Season__c> seasons = new Map<String, Season__c>();
    public List<SendLog.Delivery> deliveries = new List<SendLog.Delivery>();
    private Map<String, List<Map<String, Object>>> rows = new Map<String, List<Map<String, Object>>>();

    Sender(Capability capability) {
      this.capability = capability;
      // API-4.4: sending is reading, so a send needs the same permission set as the web address.
      this.allowed = IncomingBatch.holds(capability.permissionSet());
    }

    /** One send: its records read and made ready to post, or why not (kept on the log). */
    OutgoingResult send(Send each, Send__c log) {
      OutgoingResult result = new OutgoingResult();
      try {
        Season__c season = season(each.season);
        log.Season__c = season.Id;
        List<Map<String, Object>> records = records(season, each.week);
        checkDestination(each.toSystem);
        SendLog.Delivery delivery = new SendLog.Delivery();
        delivery.log = log;
        delivery.destination = each.toSystem;
        delivery.body = bodyOf(each, season, records);
        delivery.contentType = each.asCsv == true
          ? 'text/csv'
          : 'application/json';
        deliveries.add(delivery);
        result.sent = true;
        result.message =
          'Sending ' +
          log.What__c +
          ' to ' +
          each.toSystem +
          ' (' +
          records.size() +
          (records.size() == 1 ? ' record)' : ' records)') +
          '. If it doesn\'t go through, Settings shows why.';
      } catch (Exception e) {
        result.message =
          'Couldn\'t send ' +
          log.What__c +
          ' to ' +
          (String.isBlank(each.toSystem) ? 'a destination' : each.toSystem) +
          ': ' +
          (e instanceof ShoreshException
            ? e.getMessage()
            : ScreenErrors.of(e).getMessage());
        log.Problem__c = result.message;
      }
      return result;
    }

    private Season__c season(String name) {
      String key = name == null ? '' : name.normalizeSpace();
      if (!seasons.containsKey(key)) {
        seasons.put(key, OutgoingRows.seasonCalled(name));
      }
      return seasons.get(key);
    }

    private List<Map<String, Object>> records(Season__c season, String week) {
      if (!allowed) {
        throw new ShoreshException(
          'This user can\'t send ' +
            capability.what() +
            '. A Salesforce admin can give it the "' +
            capability.permissionLabel() +
            '" permission set.'
        );
      }
      if (++made > MOST_SENDS) {
        throw new ShoreshException(
          'Shoresh sends at most ' +
            MOST_SENDS +
            ' at a time. Send this one again.'
        );
      }
      String key = season.Id + '|' + IncomingBatch.fold(week);
      if (!rows.containsKey(key)) {
        rows.put(key, rowsOf(capability, season, week));
      }
      return rows.get(key);
    }

    private String bodyOf(
      Send each,
      Season__c season,
      List<Map<String, Object>> records
    ) {
      if (each.asCsv == true) {
        return OutgoingRows.csvOf(fieldsOf(capability, season), records);
      }
      return JSON.serialize(
        new Map<String, Object>{
          'what' => capability.name(),
          'season' => season.Name,
          'week' => each.week,
          'records' => records
        }
      );
    }
  }

  /** A saved destination's name, or refused in plain words. */
  private static void checkDestination(String destination) {
    if (
      String.isBlank(destination) ||
      !NAMED_CREDENTIAL.matcher(destination).matches()
    ) {
      throw new ShoreshException(
        'Say which saved destination to send to (to_system): the name of a Named Credential, letters, numbers and single underscores.'
      );
    }
  }

  /** Posts the body to the saved destination of this name; refused unless it takes it. */
  public static void post(String destination, String body, String contentType) {
    checkDestination(destination);
    HttpRequest request = new HttpRequest();
    request.setEndpoint('callout:' + destination);
    request.setMethod('POST');
    request.setTimeout(30000);
    request.setHeader('Content-Type', contentType);
    request.setBody(body);
    HttpResponse response = new Http().send(request);
    if (response.getStatusCode() < 200 || response.getStatusCode() > 299) {
      throw new ShoreshException(
        destination +
          ' answered ' +
          response.getStatusCode() +
          ' ' +
          String.valueOf(response.getStatus()).left(200) +
          '.'
      );
    }
  }
}
