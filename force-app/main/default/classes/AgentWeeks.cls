/**
 * What the person's own actions through an agent or the command line share (docs/protocol/api.md
 * API-1.11 to API-1.14): the program's Generated Schedule week, found by the names the camp uses
 * and locked as the screen's save locks it; the version kept before each change, which is the
 * change's mark ("Through an agent" in Versions) and its Undo; and the answer, one plain
 * sentence. Only these web addresses make such changes, so the address itself is the mark: the
 * screens never use it. Runs in user mode, so the person has exactly the access they have on
 * Generated Schedule.
 */
public with sharing class AgentWeeks {
  public static final String THROUGH_AGENT = 'ThroughAgent';
  public static final String NO_ACCESS = 'This user can\'t change schedules in Shoresh. A Salesforce admin can give it the "Shoresh Scheduler" permission set.';
  // 1900-01-01 was a Monday.
  private static final Date A_MONDAY = Date.newInstance(1900, 1, 1);
  private static final List<String> DAY_NAMES = new List<String>{
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  };

  /** Someone else's change got in the way: nothing was changed (answered 409). */
  public class ConflictException extends Exception {
  }

  /** The week asked for: its Generated draft, locked until the request ends. */
  public class Week {
    public Schedule__c draft;
    public String name;
  }

  /**
   * The season's week (season, week, program) on Generated Schedule, locked as a save locks it.
   * The program may be left out when the season has only one.
   */
  public static Week weekOf(Map<String, Object> body) {
    // Changing a schedule on screen takes the Shoresh Scheduler permission set (or an admin's
    // access): without the right to change schedules, nothing is tried.
    if (
      !Schedule__c.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED)
        .isUpdateable()
    ) {
      throw new ShoreshException(NO_ACCESS);
    }
    Season__c season = OutgoingRows.seasonCalled(
      AgentFields.text(body, 'season')
    );
    String weekName = AgentFields.text(body, 'week');
    OutgoingRows.requireWeek(weekName);
    Week__c week = (Week__c) named(
      [
        SELECT Id, Name
        FROM Week__c
        WHERE Season__c = :season.Id
        WITH USER_MODE
        ORDER BY SortOrder__c, StartDate__c
      ],
      weekName,
      'week'
    );
    Program__c program = programOf(season, AgentFields.text(body, 'program'));
    Schedule__c found = GeneratedDrafts.find(program.Id, week.Id);
    if (found == null) {
      throw new ShoreshException(
        week.Name +
          ' hasn\'t been built for ' +
          program.Name +
          ' yet. Build it on Generated Schedule first.'
      );
    }
    Week result = new Week();
    result.draft = GeneratedDrafts.lockedToEdit(found.Id);
    result.name = week.Name;
    return result;
  }

  private static Program__c programOf(Season__c season, String name) {
    List<Program__c> programs = [
      SELECT Id, Name
      FROM Program__c
      WHERE Season__c = :season.Id
      WITH USER_MODE
      ORDER BY SortOrder__c, Name
    ];
    if (String.isBlank(name) && programs.size() == 1) {
      return programs[0];
    }
    if (String.isBlank(name)) {
      List<String> names = new List<String>();
      for (Program__c program : programs) {
        names.add(program.Name);
      }
      throw new ShoreshException(
        programs.isEmpty()
          ? season.Name + ' has no programs yet.'
          : 'Say which program (program): ' + String.join(names, ', ') + '.'
      );
    }
    return (Program__c) named(programs, name, 'program');
  }

  /** The one record of that name (as camps type names); refused in plain words otherwise. */
  private static SObject named(List<SObject> rows, String name, String what) {
    for (SObject row : rows) {
      if (
        IncomingBatch.fold((String) row.get('Name')) == IncomingBatch.fold(name)
      ) {
        return row;
      }
    }
    throw new ShoreshException(
      'There is no ' +
        what +
        ' called "' +
        name.left(80) +
        '" that this user can see.'
    );
  }

  /** The day of the week asked for, by its weekday ("Monday") or date ("2026-06-29"). */
  public static ScheduleDays.DayGrid dayOf(
    List<ScheduleDays.DayGrid> days,
    String asked,
    String weekName
  ) {
    if (String.isBlank(asked)) {
      throw new ShoreshException('Say which day (day), like Monday.');
    }
    for (ScheduleDays.DayGrid day : days) {
      if (
        String.valueOf(day.day) == asked ||
        IncomingBatch.fold(dayName(day.day)) == IncomingBatch.fold(asked)
      ) {
        if (day.grid == null) {
          throw new ShoreshException(
            'This day could not be read: ' + day.problem + '.'
          );
        }
        return day;
      }
    }
    throw new ShoreshException(
      weekName + ' has no day "' + asked.left(40) + '" in its schedule.'
    );
  }

  /** "Monday", as Generated Schedule names a day. */
  public static String dayName(Date day) {
    return DAY_NAMES[Math.mod(A_MONDAY.daysBetween(day), 7)];
  }

  /**
   * The draft as it is now, kept as a version marked "Through an agent" before the change is made:
   * the person sees it in Versions, and Undo brings it back (AgentUndo).
   */
  public static Id keepBefore(
    Schedule__c draft,
    List<ScheduleDays.DayGrid> days,
    String change
  ) {
    Id versionId = ManualVersions.newVersion(
      draft,
      ('Before ' + change).left(80),
      THROUGH_AGENT
    );
    ManualVersions.writeDays(versionId, days);
    return versionId;
  }

  /** After the change: the week's revisions now, so its Undo is refused once anyone saves since. */
  public static void changed(Id versionId, Id draftId) {
    Database.update(
      new Schedule__c(
        Id = versionId,
        RevisionsAfter__c = fingerprint(ScheduleDays.read(draftId))
      ),
      AccessLevel.USER_MODE
    );
  }

  /** The week's day revisions as a short fingerprint (a long week's own text can pass 255). */
  public static String fingerprint(List<ScheduleDays.DayGrid> days) {
    return EncodingUtil.convertToHex(
      Crypto.generateDigest('SHA-256', Blob.valueOf(ScheduleDays.stamp(days)))
    );
  }

  /**
   * Runs one action and answers {"message": sentence}: 200 when done, 409 for someone else's
   * change, 400 for a refusal in Shoresh's words, 500 for anything else (in Shoresh's words too).
   */
  public static void answer(Action action) {
    RestResponse response = RestContext.response;
    response.addHeader('Content-Type', 'application/json');
    Savepoint before = Database.setSavepoint();
    Integer status;
    String message;
    try {
      message = action.run();
      status = 200;
    } catch (ConflictException e) {
      Database.rollback(before);
      status = 409;
      message = e.getMessage();
    } catch (Exception e) {
      Database.rollback(before);
      Boolean ours = e instanceof ShoreshException;
      status = ours ? 400 : 500;
      message = ours ? e.getMessage() : ScreenErrors.of(e).getMessage();
    }
    response.statusCode = status;
    response.responseBody = Blob.valueOf(
      JSON.serialize(new Map<String, String>{ 'message' => message })
    );
  }

  /** One action through an agent: its answer when done. */
  public interface Action {
    String run();
  }
}
