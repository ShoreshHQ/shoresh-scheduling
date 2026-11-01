/**
 * What camper_elective_choice does with each record (IncomingCamperElectiveChoice;
 * docs/protocol/api.md). Choices are stored as the choices sheet stores them
 * (ChoicesImport.SheetChoice: ranked, the name as written and the activity it is), so a camper's
 * choices read the same however they came in.
 *
 * - API-4.1: choices a person changed in Shoresh are kept; the incoming ones are kept beside them
 *   (ImportedChoices__c) and a person is asked on Roots.
 * - API-2.5: the same choices again change nothing; changed_at older than the last taken for
 *   those choices is ignored, and said.
 * - Final seats are never changed from outside.
 */
public with sharing class IncomingElectiveChoicePlan {
  private IncomingBatch batch;
  private IncomingCampers campers;
  private IncomingRuns runs;
  private Map<String, Preference__c> saved;
  // What each set offers: activity by folded name (proposed offerings too, as the sheet).
  private Map<Id, Map<String, Id>> offered = new Map<Id, Map<String, Id>>();
  private Set<String> seen = new Set<String>();
  // The record being looked at: its position, itself, and the elective run it names.
  private Integer i;
  private IncomingCamperElectiveChoice.Record record;
  private ElectiveRun__c run;

  public IncomingElectiveChoicePlan(IncomingBatch batch) {
    this.batch = batch;
  }

  public void plan(List<Object> sent) {
    List<IncomingCamperElectiveChoice.Record> records = new List<IncomingCamperElectiveChoice.Record>();
    List<Camper__c> asSent = new List<Camper__c>();
    for (Object item : sent) {
      IncomingCamperElectiveChoice.Record record = item == null
        ? new IncomingCamperElectiveChoice.Record()
        : (IncomingCamperElectiveChoice.Record) item;
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
    runs = IncomingRuns.forChoices(batch.season.Id);
    saved = runs.choicesOf(campers.found());
    readOffered(records);
    for (Integer i = 0; i < records.size(); i++) {
      if (batch.open(i)) {
        this.i = i;
        record = records[i];
        run = runs.run(record.elective, record.week);
        planOne();
      }
    }
  }

  private void planOne() {
    String refusal = refusal();
    if (refusal != null) {
      batch.problem(i, refusal);
      return;
    }
    Id camperId = campers.at(i).Id;
    if (!seen.add(run.Id + '|' + camperId)) {
      batch.problem(
        i,
        'This camper is in the batch more than once for this elective. Only the first was used.'
      );
      return;
    }
    List<ChoicesImport.SheetChoice> choices = choicesOf();
    if (choices != null) {
      bringIn(choices);
    }
  }

  private String refusal() {
    String aboutCamper = camperRefusal();
    if (aboutCamper != null) {
      return aboutCamper;
    }
    if (
      run == null &&
      runs.notStarted(batch.season.Id, record.elective, record.week)
    ) {
      // API-6.4: the first run is the Elective seats screen's own Bring in choices.
      return 'No choices brought in for ' +
        record.elective.left(80) +
        ' in ' +
        record.week.left(80) +
        ' yet, so Shoresh has nowhere to keep these. A person brings them in once on the ' +
        batch.labels.singular('Elective') +
        ' seats screen (choose ' +
        record.elective.left(80) +
        ' and ' +
        record.week.left(80) +
        ', then Bring in choices); after that, send these again.';
    }
    if (run == null) {
      return 'There is no elective "' +
        record.elective.left(80) +
        '" in "' +
        record.week.left(80) +
        '" in this season.';
    }
    if (run.Status__c == ChoicesImport.FINAL_STATUS) {
      return 'Seats for ' +
        run.Name +
        ' are final, so choices were not changed.';
    }
    return null;
  }

  /** Who the record is about, and when it changed. */
  private String camperRefusal() {
    if (
      String.isBlank(record.camper_id) && String.isBlank(record.camper_name)
    ) {
      return IncomingCampers.sayWho();
    }
    if (IncomingCamperPlan.isFuture(record.changed_at)) {
      return IncomingCamperPlan.FUTURE;
    }
    if (String.isBlank(record.elective) || String.isBlank(record.week)) {
      return 'Say which elective (elective) and which week (week).';
    }
    if (campers.doubt(i)) {
      return IncomingCampers.DOUBT;
    }
    return campers.at(i) == null ? IncomingCampers.notFound() : null;
  }

  private void readOffered(List<IncomingCamperElectiveChoice.Record> records) {
    for (IncomingCamperElectiveChoice.Record each : records) {
      ElectiveRun__c named = runs.run(each.elective, each.week);
      if (named != null) {
        offered.put(named.ElectiveSet__c, new Map<String, Id>());
      }
    }
    Set<Id> setIds = offered.keySet();
    for (Offering__c offering : [
      SELECT ElectiveSet__c, Activity__c, Activity__r.Name
      FROM Offering__c
      WHERE ElectiveSet__c IN :setIds
      WITH USER_MODE
    ]) {
      offered.get(offering.ElectiveSet__c)
        .put(
          IncomingBatch.fold(offering.Activity__r.Name),
          offering.Activity__c
        );
    }
  }

  /** The choices as the sheet stores them, or null with a problem for a name not offered. */
  private List<ChoicesImport.SheetChoice> choicesOf() {
    List<ChoicesImport.SheetChoice> choices = new List<ChoicesImport.SheetChoice>();
    for (String name : record.choices()) {
      Id activityId = offered.get(run.ElectiveSet__c)
        .get(IncomingBatch.fold(name));
      if (activityId == null) {
        batch.problem(
          i,
          '"' +
            name.left(80) +
            '" is not offered in ' +
            run.ElectiveSet__r.Name +
            '. Use the activity\'s name as Shoresh has it.'
        );
        return null;
      }
      ChoicesImport.SheetChoice choice = new ChoicesImport.SheetChoice();
      choice.n = name.left(255);
      choice.a = activityId;
      choice.r = choices.size() + 1;
      choice.k = 'ranked';
      choices.add(choice);
    }
    return choices;
  }

  private void bringIn(List<ChoicesImport.SheetChoice> choices) {
    String imported = JSON.serialize(choices, true);
    Preference__c had = saved.get(run.Id + '|' + campers.at(i).Id);
    if (had == null) {
      batch.save(
        i,
        new Preference__c(
          ElectiveRun__c = run.Id,
          Camper__c = campers.at(i).Id,
          Choices__c = imported,
          ImportedChoices__c = imported,
          ChoicesChangedAt__c = record.changed_at
        ),
        'Saved.'
      );
    } else if (
      IncomingCamperPlan.isOlder(record.changed_at, had.ChoicesChangedAt__c)
    ) {
      batch.unchanged(
        i,
        'Ignored: Shoresh already has later choices for this camper.'
      );
    } else if (isSame(had, choices)) {
      batch.unchanged(i, 'Already up to date.');
    } else {
      change(had, imported);
    }
  }

  /** A person changed them by hand: marked so, or no longer what was last brought in. */
  private static Boolean handChanged(Preference__c had) {
    return had.ManualChange__c ||
      (had.ImportedChoices__c != null &&
      ChoicesImportChoices.signature(had.Choices__c) !=
      ChoicesImportChoices.signature(had.ImportedChoices__c));
  }

  /** What was brought in last is these, and the choices used are too (unless a person's). */
  private static Boolean isSame(
    Preference__c had,
    List<ChoicesImport.SheetChoice> choices
  ) {
    String signature = ChoicesImportChoices.signature(choices);
    return ChoicesImportChoices.signature(had.ImportedChoices__c) ==
      signature &&
      (handChanged(had) ||
      ChoicesImportChoices.signature(had.Choices__c) == signature);
  }

  private void change(Preference__c had, String imported) {
    Preference__c row = new Preference__c(
      Id = had.Id,
      ImportedChoices__c = imported,
      ChoicesChangedAt__c = record.changed_at == null
        ? had.ChoicesChangedAt__c
        : record.changed_at
    );
    if (!handChanged(had)) {
      row.Choices__c = imported;
      batch.save(i, row, 'Saved.');
      return;
    }
    // API-4.1: a person's change wins; the incoming choices are kept beside it, and asked about.
    batch.save(
      i,
      row,
      'A person changed these choices in Shoresh, so theirs are kept. These are kept beside them for a person to look at.'
    );
    batch.ask(
      'choices|' + had.Id,
      campers.at(i).Name +
        '\'s choices for ' +
        run.Name +
        ' were changed in Shoresh, and ' +
        record.source_system.normalizeSpace() +
        ' now sends different ones. Shoresh kept the ones changed in Shoresh.'
    );
  }
}
