/**
 * Where a choices sheet goes (ChoicesImport; repo ADR 0017 choices 14 and 17): the request's
 * season, elective set, week and schedule, checked to belong together, and the run they make. One
 * Committed run per set, week and schedule; a final one takes no new choices; a save whose check
 * saw another revision of the run is refused. In user mode.
 */
public with sharing class ChoicesImportPlace {
  public ChoicesImport.Request request;
  public Id campId;
  public ElectiveSet__c electiveSet;
  public Week__c week;
  public Schedule__c schedule;
  // The committed run (null until the first save), and a final one's name when that is all.
  public ElectiveRun__c run;
  public Boolean isFinal = false;
  public String finalRunName;
  // This set's runs this week on other schedules (another program's grid).
  private Integer otherRuns = 0;

  public ChoicesImportPlace(ChoicesImport.Request given) {
    request = given;
    if (given == null || given.seasonId == null) {
      throw new ShoreshException('Choose the season first.');
    }
    campId = ChoicesImport.seasonOf(given.seasonId).Camp__c;
    refuseIncomplete(given, campId);
    readPlace();
    readRuns();
  }

  /** The camp's words are read only for the refusal (the screens always send all four). */
  private static void refuseIncomplete(ChoicesImport.Request given, Id campId) {
    if (
      new List<Id>{ given.electiveSetId, given.weekId, given.scheduleId }
        .contains(null)
    ) {
      CampLabels labels = CampLabels.forCamp(campId);
      throw new ShoreshException(
        'Choose the ' +
          labels.singularInSentence('ElectiveSet') +
          ', the ' +
          labels.singularInSentence('Week') +
          ' and the schedule first.'
      );
    }
    if (given.campers == null || given.campers.isEmpty()) {
      throw new ShoreshException('There are no campers on this sheet.');
    }
    for (ChoicesImport.SheetCamper sheetCamper : given.campers) {
      if (sheetCamper.choices == null) {
        sheetCamper.choices = new List<ChoicesImport.SheetChoice>();
      }
    }
  }

  private void readPlace() {
    List<ElectiveSet__c> sets = [
      SELECT Id, Name
      FROM ElectiveSet__c
      WHERE Id = :request.electiveSetId AND Season__c = :request.seasonId
      WITH USER_MODE
    ];
    List<Week__c> weeks = [
      SELECT Id, Name
      FROM Week__c
      WHERE Id = :request.weekId AND Season__c = :request.seasonId
      WITH USER_MODE
    ];
    List<Schedule__c> schedules = [
      SELECT Id, Program__c, Program__r.Name
      FROM Schedule__c
      WHERE
        Id = :request.scheduleId
        AND Week__c = :request.weekId
        AND Program__r.Season__c = :request.seasonId
      WITH USER_MODE
    ];
    if (sets.isEmpty() || weeks.isEmpty() || schedules.isEmpty()) {
      // In the camp's words, read only for the refusal.
      CampLabels labels = CampLabels.forCamp(campId);
      throw new ShoreshException(
        'That ' +
          labels.singularInSentence('ElectiveSet') +
          ', ' +
          labels.singularInSentence('Week') +
          ' or schedule is no longer there. Reload the page.'
      );
    }
    electiveSet = sets[0];
    week = weeks[0];
    schedule = schedules[0];
  }

  /** The committed run for this set, week and schedule, if any; a final one alone refuses. */
  private void readRuns() {
    for (ElectiveRun__c each : [
      SELECT Id, Name, Status__c, Revision__c, Schedule__c
      FROM ElectiveRun__c
      WHERE
        ElectiveSet__c = :request.electiveSetId
        AND Week__c = :request.weekId
      WITH USER_MODE
      ORDER BY CreatedDate, Id
    ]) {
      if (each.Schedule__c != request.scheduleId) {
        otherRuns++;
      } else if (each.Status__c == ChoicesImport.FINAL_STATUS) {
        finalRunName = each.Name;
      } else {
        run = each;
      }
    }
    isFinal = run == null && finalRunName != null;
  }

  public void refuseIfFinal() {
    if (isFinal) {
      throw new ShoreshException(
        '"' + finalRunName + '" is final, so it can\'t take new choices.'
      );
    }
  }

  /** Someone else brought choices into this run since the screen checked: refused. */
  public void checkRevision() {
    Decimal now = run == null ? null : run.Revision__c;
    if (now != request.runRevision) {
      throw new ShoreshException(
        'Someone else brought in choices for this run since you started. Choose the file again to see them.'
      );
    }
  }

  /** A new committed run, or the committed run's revision moved on; the file it came from. */
  public void saveRun() {
    if (run == null) {
      run = new ElectiveRun__c(
        Season__c = request.seasonId,
        Name = runName(),
        ElectiveSet__c = electiveSet.Id,
        Week__c = week.Id,
        Schedule__c = schedule.Id,
        Status__c = ChoicesImport.COMMITTED,
        Revision__c = 1
      );
    } else {
      run.Revision__c = (run.Revision__c == null ? 0 : run.Revision__c) + 1;
    }
    run.SourceFile__c = String.isBlank(request.fileName)
      ? null
      : request.fileName.left(255);
    run.SourceFingerprint__c = String.isBlank(request.fingerprint)
      ? null
      : request.fingerprint.left(64);
    if (run.Id == null) {
      Database.insert(run, AccessLevel.USER_MODE);
    } else {
      Database.update(run, AccessLevel.USER_MODE);
    }
  }

  /** "Chugim · Week 3"; with another program's run of the same set and week, its program too. */
  private String runName() {
    String name = electiveSet.Name + ' · ' + week.Name;
    if (otherRuns > 0) {
      name += ' · ' + schedule.Program__r.Name;
    }
    return name.left(80);
  }
}
