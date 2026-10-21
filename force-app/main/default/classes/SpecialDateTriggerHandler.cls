/**
 * Special dates (ADR 0014): the week and the special day or event are in the row's own season,
 * the week has that weekday, and the hidden key (week + weekday + what is placed) lets Salesforce
 * refuse a second special day on a week day, or the same special event twice on one, with a
 * message in the camp's words first.
 */
public with sharing class SpecialDateTriggerHandler {
  // In the key, every special day shares one mark, so a week day holds at most one of them.
  private static final String ANY_SPECIAL_DAY = 'D';

  public static void beforeSave(List<SpecialDate__c> rows) {
    Set<Id> seasonIds = new Set<Id>();
    Set<Id> weekIds = new Set<Id>();
    Set<Id> itemIds = new Set<Id>();
    Set<Id> savingIds = new Set<Id>();
    for (SpecialDate__c row : rows) {
      row.Key__c = keyOf(row);
      seasonIds.add(row.Season__c);
      weekIds.add(row.Week__c);
      itemIds.add(row.SpecialDay__c);
      itemIds.add(row.SpecialEvent__c);
      if (row.Id != null) {
        savingIds.add(row.Id);
      }
    }
    itemIds.remove(null);
    weekIds.remove(null);
    Map<Id, Week__c> weeks = new Map<Id, Week__c>(
      [
        SELECT Id, Name, Season__c, StartDate__c, EndDate__c
        FROM Week__c
        WHERE Id IN :weekIds
        WITH SYSTEM_MODE
      ]
    );
    Map<Id, SObject> items = itemsOf(itemIds);
    SetupSeasons.LazyLabels labelsBySeason = SetupSeasons.labelsWhenNeeded(
      seasonIds
    );
    for (SpecialDate__c row : rows) {
      check(row, weeks.get(row.Week__c), items, labelsBySeason);
    }
    refuseTaken(rows, weekIds, savingIds, weeks, labelsBySeason);
  }

  private static Map<Id, SObject> itemsOf(Set<Id> itemIds) {
    Map<Id, SObject> items = new Map<Id, SObject>();
    items.putAll(
      [
        SELECT Id, Name, Season__c
        FROM SpecialDay__c
        WHERE Id IN :itemIds
        WITH SYSTEM_MODE
      ]
    );
    items.putAll(
      [
        SELECT Id, Name, Season__c
        FROM SpecialEvent__c
        WHERE Id IN :itemIds
        WITH SYSTEM_MODE
      ]
    );
    return items;
  }

  private static void check(
    SpecialDate__c row,
    Week__c week,
    Map<Id, SObject> items,
    SetupSeasons.LazyLabels labelsBySeason
  ) {
    String term = termOf(row);
    SObject item = items.get(itemOf(row));
    if (week != null && week.Season__c != row.Season__c) {
      row.Week__c.addError(
        SetupSeasons.otherSeason(
          labelsBySeason.get(row.Season__c),
          'Week',
          term
        )
      );
    } else if (item != null && seasonOf(item) != row.Season__c) {
      row.addError(
        SetupSeasons.otherSeason(
          labelsBySeason.get(row.Season__c),
          term,
          'Week'
        )
      );
    } else if (
      week != null &&
      row.Day__c != null &&
      SpecialDates.dateOf(week.StartDate__c, week.EndDate__c, row.Day__c) ==
      null
    ) {
      row.Day__c.addError('"' + week.Name + '" has no ' + row.Day__c + '.');
    }
  }

  /**
   * 'Tuesday of "Week 2" already has the special day "Color War". Take it off first, or choose
   * another day.' Rows in this save are compared with their new values, so moving two in one
   * save is fine.
   */
  private static void refuseTaken(
    List<SpecialDate__c> rows,
    Set<Id> weekIds,
    Set<Id> savingIds,
    Map<Id, Week__c> weeks,
    SetupSeasons.LazyLabels labelsBySeason
  ) {
    Map<String, String> takenBy = new Map<String, String>();
    for (SpecialDate__c existing : [
      SELECT
        Week__c,
        Day__c,
        SpecialDay__c,
        SpecialEvent__c,
        SpecialDay__r.Name,
        SpecialEvent__r.Name
      FROM SpecialDate__c
      WHERE Week__c IN :weekIds AND Id NOT IN :savingIds
      WITH SYSTEM_MODE
    ]) {
      takenBy.put(
        keyOf(existing),
        existing.SpecialDay__c != null
          ? existing.SpecialDay__r.Name
          : existing.SpecialEvent__r.Name
      );
    }
    for (SpecialDate__c row : rows) {
      if (row.hasErrors() || row.Week__c == null) {
        continue;
      }
      String other = takenBy.get(row.Key__c);
      if (other == null) {
        takenBy.put(row.Key__c, '');
        continue;
      }
      CampLabels labels = labelsBySeason.get(row.Season__c);
      String onDay = SpecialDates.onDay(
        row.Day__c,
        weeks.get(row.Week__c)?.Name
      );
      row.addError(
        row.SpecialDay__c != null
          ? onDay +
            ' already has ' +
            (String.isBlank(other)
              ? 'a ' + labels.singularInSentence('SpecialDay')
              : 'the ' +
                labels.singularInSentence('SpecialDay') +
                ' "' +
                other +
                '"') +
            '. Take it off first, or choose another day.'
          : 'This ' +
            labels.singularInSentence('SpecialEvent') +
            ' is already on ' +
            onDay +
            '.'
      );
    }
  }

  private static Id seasonOf(SObject item) {
    return item instanceof SpecialDay__c
      ? ((SpecialDay__c) item).Season__c
      : ((SpecialEvent__c) item).Season__c;
  }

  private static String termOf(SpecialDate__c row) {
    return row.SpecialEvent__c != null ? 'SpecialEvent' : 'SpecialDay';
  }

  private static Id itemOf(SpecialDate__c row) {
    return row.SpecialDay__c != null ? row.SpecialDay__c : row.SpecialEvent__c;
  }

  @TestVisible
  private static String keyOf(SpecialDate__c row) {
    return row.Week__c +
      '|' +
      row.Day__c +
      '|' +
      (row.SpecialDay__c != null ? ANY_SPECIAL_DAY : row.SpecialEvent__c);
  }
}
