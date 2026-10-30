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
      List<Map<String, Object>> rows = capability.rows(found, week);
      response.statusCode = 200;
      if (asCsv) {
        response.addHeader('Content-Type', 'text/csv');
        response.responseBody = Blob.valueOf(
          OutgoingRows.csvOf(capability.fields(), rows)
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
      JSON.serialize(new Map<String, String>{ 'message' => message })
    );
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
   * The Flow action: each send's records posted to its destination, every send kept, and what
   * happened answered. All sends are made before anything is saved (Salesforce allows no send
   * after a save in the same go).
   */
  public static List<OutgoingResult> bySend(
    Capability capability,
    List<Send> sends
  ) {
    List<OutgoingResult> results = new List<OutgoingResult>();
    List<Send__c> kept = new List<Send__c>();
    for (Send each : sends) {
      Send__c log = new Send__c(
        System__c = String.isBlank(each.toSystem)
          ? null
          : each.toSystem.left(80),
        What__c = (capability.what() +
          (String.isBlank(each.week) ? '' : ' for ' + each.week))
          .left(255)
      );
      results.add(sendOne(capability, each, log));
      // A send for a season no one can find has nowhere on a screen to show; its Flow is told.
      if (log.Season__c != null) {
        kept.add(log);
      }
    }
    SendLog.keep(kept);
    return results;
  }

  /** One send: its records posted, and what happened said (and kept on the log when it failed). */
  private static OutgoingResult sendOne(
    Capability capability,
    Send each,
    Send__c log
  ) {
    OutgoingResult result = new OutgoingResult();
    try {
      Season__c season = OutgoingRows.seasonCalled(each.season);
      log.Season__c = season.Id;
      List<Map<String, Object>> rows = capability.rows(season, each.week);
      Boolean asCsv = each.asCsv == true;
      post(
        each.toSystem,
        asCsv
          ? OutgoingRows.csvOf(capability.fields(), rows)
          : JSON.serialize(
              new Map<String, Object>{
                'what' => capability.name(),
                'season' => season.Name,
                'week' => each.week,
                'records' => rows
              }
            ),
        asCsv
      );
      result.sent = true;
      result.message =
        'Sent ' +
        log.What__c +
        ' to ' +
        each.toSystem +
        ' (' +
        rows.size() +
        (rows.size() == 1 ? ' record).' : ' records).');
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

  /** Posts the body to the saved destination of this name; refused unless it takes it. */
  private static void post(String destination, String body, Boolean asCsv) {
    if (
      String.isBlank(destination) ||
      !NAMED_CREDENTIAL.matcher(destination).matches()
    ) {
      throw new ShoreshException(
        'Say which saved destination to send to (to_system): the name of a Named Credential, letters, numbers and single underscores.'
      );
    }
    HttpRequest request = new HttpRequest();
    request.setEndpoint('callout:' + destination);
    request.setMethod('POST');
    request.setTimeout(30000);
    request.setHeader('Content-Type', asCsv ? 'text/csv' : 'application/json');
    request.setBody(body);
    HttpResponse response = new Http().send(request);
    if (response.getStatusCode() < 200 || response.getStatusCode() > 299) {
      throw new ShoreshException(
        destination +
          ' answered ' +
          response.getStatusCode() +
          ' ' +
          response.getStatus() +
          '.'
      );
    }
  }
}
