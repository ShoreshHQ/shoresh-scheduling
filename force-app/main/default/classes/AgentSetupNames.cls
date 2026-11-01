/**
 * A setup field that names another record (docs/protocol/api.md API-1.49): found by name among the
 * ones the screen's picklist offers (the season's locations, location types or activities, or the
 * program's divisions or time blocks). Left blank or "none" it is cleared; a group's division
 * "none" is No division (DIV-1.1); a time block can't be left blank, as the table requires it. A
 * name not there, or shared by two, is refused naming the ones there are.
 */
public with sharing class AgentSetupNames {
  /** The Id of the record the value names, or null to clear it. */
  public static Id idCalled(
    String key,
    String asked,
    AgentSetupFields.Put put
  ) {
    AgentSetupRecords.Found found = put.found;
    Boolean none = String.isBlank(asked) || IncomingBatch.fold(asked) == 'none';
    if (none && key == 'division') {
      put.extras.noDivisionProgram = found.programId;
      return null;
    }
    if (none && key == 'time_block') {
      throw new ShoreshException(
        AgentSetupFields.aOrAn(found.kind) +
        ' needs its time block (time_block).'
      );
    }
    if (none) {
      return null;
    }
    String term = termOf(key);
    return onlyOne(
      choices(term, found),
      asked,
      new List<String>{
        found.labels.singularInSentence(term),
        found.labels.pluralInSentence(term)
      }
    );
  }

  /** The kind of record a field names. */
  private static String termOf(String key) {
    switch on key {
      when 'location' {
        return 'Location';
      }
      when 'location_type' {
        return 'LocationType';
      }
      when 'rain_plan' {
        return 'Activity';
      }
      when 'division' {
        return 'Division';
      }
      when else {
        return 'TimeBlock';
      }
    }
  }

  /** The records the screen's picklist offers for that kind. */
  private static List<SObject> choices(
    String term,
    AgentSetupRecords.Found found
  ) {
    Id seasonId = found.seasonId;
    Id programId = found.programId;
    switch on term {
      when 'Location' {
        return [
          SELECT Id, Name
          FROM Location__c
          WHERE Season__c = :seasonId
          WITH USER_MODE
          ORDER BY SortOrder__c, Name
        ];
      }
      when 'LocationType' {
        return [
          SELECT Id, Name
          FROM LocationType__c
          WHERE Season__c = :seasonId
          WITH USER_MODE
          ORDER BY SortOrder__c, Name
        ];
      }
      when 'Activity' {
        return [
          SELECT Id, Name
          FROM Activity__c
          WHERE Season__c = :seasonId
          WITH USER_MODE
          ORDER BY SortOrder__c, Name
        ];
      }
      when 'Division' {
        return [
          SELECT Id, Name
          FROM Division__c
          WHERE Program__c = :programId AND NoDivision__c = FALSE
          WITH USER_MODE
          ORDER BY SortOrder__c, Name
        ];
      }
      when else {
        return [
          SELECT Id, Name
          FROM TimeBlock__c
          WHERE Program__c = :programId
          WITH USER_MODE
          ORDER BY SortOrder__c, StartTime__c, Name
        ];
      }
    }
  }

  /** The one row of that name; none or two are refused (words: the kind, singular then plural). */
  private static Id onlyOne(
    List<SObject> rows,
    String asked,
    List<String> words
  ) {
    String word = words[0];
    List<String> names = new List<String>();
    Id match;
    for (SObject row : rows) {
      String name = (String) row.get('Name');
      names.add(name);
      if (IncomingBatch.fold(name) != IncomingBatch.fold(asked)) {
        continue;
      }
      if (match != null) {
        throw new ShoreshException(
          'More than one ' +
            word +
            ' is called "' +
            asked.left(80) +
            '", so Shoresh can\'t tell which you mean. Rename one in Shoresh, then ask again.'
        );
      }
      match = row.Id;
    }
    if (match == null) {
      throw new ShoreshException(
        'There is no ' +
          word +
          ' called "' +
          asked.left(80) +
          '" that this user can see. ' +
          AgentWeeks.namesSaid(words[1], names)
      );
    }
    return match;
  }
}
