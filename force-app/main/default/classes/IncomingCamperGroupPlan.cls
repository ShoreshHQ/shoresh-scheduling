/**
 * What camper_group does with each record (IncomingCamperGroup; docs/protocol/api.md). Shoresh
 * keeps a camper's bunk with their elective choices for each week (Preference__c), so a bunk is
 * set on the camper's choices in the week named, or in every week with none named. A bunk belongs
 * to the other system (API-4.2): it changes only here, inside the save. Final seats are not
 * changed.
 */
public with sharing class IncomingCamperGroupPlan {
  private IncomingBatch batch;
  private IncomingCampers campers;
  private IncomingRuns runs;
  private Map<String, Preference__c> rows;
  private String groupWord;
  private Set<Id> touched = new Set<Id>();

  public IncomingCamperGroupPlan(IncomingBatch batch) {
    this.batch = batch;
    groupWord = batch.labels.singularInSentence('Group');
  }

  public void plan(List<Object> sent) {
    List<IncomingCamperGroup.Record> records = new List<IncomingCamperGroup.Record>();
    List<Camper__c> asSent = new List<Camper__c>();
    for (Object item : sent) {
      IncomingCamperGroup.Record record = item == null
        ? new IncomingCamperGroup.Record()
        : (IncomingCamperGroup.Record) item;
      records.add(record);
      asSent.add(
        IncomingCampers.asSent(
          record.source_system,
          record.camper_id,
          record.camper_name
        )
      );
    }
    campers = new IncomingCampers(batch.season.Id, asSent);
    runs = IncomingRuns.forBunks(batch.season.Id);
    rows = runs.bunksOf(campers.found());
    for (Integer i = 0; i < records.size(); i++) {
      if (batch.open(i)) {
        planOne(i, records[i]);
      }
    }
  }

  private void planOne(Integer i, IncomingCamperGroup.Record record) {
    if (
      String.isBlank(record.camper_id) && String.isBlank(record.camper_name)
    ) {
      batch.problem(i, IncomingCampers.sayWho());
    } else if (String.isBlank(record.bunk)) {
      batch.problem(i, 'Say which ' + groupWord + ' (bunk).');
    } else if (campers.doubt(i)) {
      batch.problem(i, IncomingCampers.DOUBT);
    } else if (campers.at(i) == null) {
      batch.problem(i, IncomingCampers.notFound());
    } else if (runs.groupNamed(record.bunk) == null) {
      batch.problem(
        i,
        'There is no ' +
          groupWord +
          ' called "' +
          record.bunk.left(80) +
          '" in this season, or more than one.'
      );
    } else {
      place(i, record);
    }
  }

  /** The camper's bunk in each of the weeks, on their choices there. */
  private void place(Integer i, IncomingCamperGroup.Record record) {
    List<ElectiveRun__c> weeks = runs.inWeek(record.week);
    if (weeks.isEmpty()) {
      batch.problem(
        i,
        String.isBlank(record.week)
          ? 'This season has no electives yet, and Shoresh keeps a camper\'s ' +
            groupWord +
            ' with their elective choices. Send it again once there are.'
          : 'There are no electives in "' +
            record.week.left(80) +
            '" in this season.'
      );
      return;
    }
    Id groupId = runs.groupNamed(record.bunk);
    List<Preference__c> changes = new List<Preference__c>();
    Integer kept = 0;
    for (Preference__c row : rowsIn(weeks, campers.at(i).Id)) {
      if (touched.contains(row.Id)) {
        batch.problem(
          i,
          'This camper is in the batch more than once. Only the first was used.'
        );
        return;
      }
      if (row.Group__c == groupId) {
        kept++;
      } else {
        changes.add(new Preference__c(Id = row.Id, Group__c = groupId));
      }
    }
    for (Preference__c change : changes) {
      touched.add(change.Id);
      batch.save(i, change, 'Saved.');
    }
    say(i, changes.size(), kept);
  }

  /** The camper's choices in these weeks that can still change. */
  private List<Preference__c> rowsIn(List<ElectiveRun__c> weeks, Id camperId) {
    List<Preference__c> result = new List<Preference__c>();
    for (ElectiveRun__c run : weeks) {
      Preference__c row = rows.get(run.Id + '|' + camperId);
      if (row != null && run.Status__c != ChoicesImport.FINAL_STATUS) {
        result.add(row);
      }
    }
    return result;
  }

  private void say(Integer i, Integer moved, Integer kept) {
    if (moved + kept == 0) {
      batch.problem(
        i,
        'This camper has no elective choices in those weeks that can still change, and Shoresh keeps a camper\'s ' +
          groupWord +
          ' with them. Send their choices first.'
      );
    } else if (moved == 0) {
      batch.unchanged(i, 'Already in that ' + groupWord + '.');
    }
  }
}
