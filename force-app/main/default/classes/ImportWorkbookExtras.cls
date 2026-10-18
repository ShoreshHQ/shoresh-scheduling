/**
 * What a camp workbook saves (slice 4c part D), beside its lists: weeks an item runs again
 * (a week off removed), and the camp's words. Filling an empty season's weeks from its dates is
 * shared with Import last year. Both are logged so Undo last import puts them back
 * (Greg: camp words are undone with the rest), unless edited since.
 */
public with sharing class ImportWorkbookExtras {
  private ImportWriter writer;
  private Id seasonId;
  private Id campId;

  public ImportWorkbookExtras(ImportWriter writer, Id seasonId, Id campId) {
    this.writer = writer;
    this.seasonId = seasonId;
    this.campId = campId;
  }

  /**
   * The season's weeks filled from its dates, as "Fill in weeks" makes them (SeasonWeeks), for
   * another season's workbook to pair with (coordinator, following Greg's "copy the weeks,
   * update the dates"): entries [{ start, name }] in order, as the preview showed them. Added
   * like any week the import adds, so Undo removes them unless used or edited since.
   */
  public void fillWeeks(List<ImportPlan.Entry> entries) {
    if (entries.isEmpty()) {
      return;
    }
    List<Week__c> weeks = weeksToFill();
    if (weeks.size() != entries.size()) {
      throw datesChanged();
    }
    for (Integer i = 0; i < weeks.size(); i++) {
      if (String.valueOf(weeks[i].StartDate__c) != entries[i].text('start')) {
        throw datesChanged();
      }
      weeks[i].Name = word(entries[i].text('name'));
    }
    writer.writeTracked('Week', weeks, new List<SObject>());
    for (Week__c week : weeks) {
      writer.keys.put('Week:' + String.valueOf(week.StartDate__c), week.Id);
    }
  }

  /**
   * The weeks "Fill in weeks" would add now. Weeks added since the preview are said plainly
   * (not "add one at a time"); dates changed since are said as such.
   */
  private List<Week__c> weeksToFill() {
    if (
      [SELECT COUNT() FROM Week__c WHERE Season__c = :seasonId WITH USER_MODE] >
      0
    ) {
      throw new ShoreshException(
        'The ' +
          CampLabels.forCamp(campId).pluralInSentence('Week') +
          ' changed since you chose the file. Choose it again.'
      );
    }
    try {
      return SeasonWeeks.toFill(seasonId);
    } catch (SeasonWeeks.WeeksException e) {
      throw datesChanged();
    }
  }

  private ShoreshException datesChanged() {
    return new ShoreshException(
      'This ' +
        CampLabels.forCamp(campId).singularInSentence('Season') +
        '\'s dates changed after the file was read. Choose the file again.'
    );
  }

  /**
   * Removes weeks off (WeekException__c) the workbook ticks back on; each must be in the season.
   * Logged as { weekOn, week, field, target, name (the week's), item (the item's name) } for Undo.
   */
  public void weeksBackOn(List<ImportPlan.Entry> entries) {
    Set<Id> ids = new Set<Id>();
    for (ImportPlan.Entry entry : entries) {
      Id recordId = entry.id();
      if (
        recordId == null ||
        recordId.getSObjectType() != WeekException__c.SObjectType
      ) {
        throw ImportListSaves.unreadable();
      }
      ids.add(recordId);
    }
    if (ids.isEmpty()) {
      return;
    }
    List<WeekException__c> found = [
      SELECT
        Id,
        Week__c,
        Week__r.Name,
        Group__r.Name,
        Location__r.Name,
        Activity__r.Name,
        FixedActivity__r.Name,
        RecurringActivity__r.Name,
        Group__c,
        Location__c,
        Activity__c,
        FixedActivity__c,
        RecurringActivity__c
      FROM WeekException__c
      WHERE Id IN :ids AND Week__r.Season__c = :seasonId
      WITH USER_MODE
    ];
    if (found.size() != ids.size()) {
      throw ImportListSaves.unreadable();
    }
    for (WeekException__c off : found) {
      Schema.SObjectField field = targetField(off);
      Id target = (Id) off.get(field);
      writer.logWeekBackOn(
        new Map<String, Object>{
          'weekOn' => off.Id,
          'week' => off.Week__c,
          'field' => ShoreshSchema.localName(field),
          'target' => target,
          'name' => off.Week__r.Name,
          'item' => off.getSObject(field).get('Name')
        },
        target
      );
    }
    Database.delete(found, AccessLevel.USER_MODE);
  }

  private static Schema.SObjectField targetField(WeekException__c off) {
    for (
      Schema.SObjectField field : new List<Schema.SObjectField>{
        WeekException__c.Group__c,
        WeekException__c.Location__c,
        WeekException__c.Activity__c,
        WeekException__c.FixedActivity__c,
        WeekException__c.RecurringActivity__c
      }
    ) {
      if (off.get(field) != null) {
        return field;
      }
    }
    throw ImportListSaves.unreadable();
  }

  /** The camp's words the director chose to change (ImportCampWords). */
  public void campWords(List<ImportPlan.Entry> entries) {
    new ImportCampWords(writer, campId).save(entries);
  }

  public static String word(Object value) {
    String text = value == null ? '' : String.valueOf(value).trim();
    if (String.isBlank(text) || text.length() > 80) {
      throw ImportListSaves.unreadable();
    }
    return text;
  }
}
