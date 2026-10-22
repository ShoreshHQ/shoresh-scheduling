/**
 * Made-up special days and events for the special schedule tests (ADR 0014 choices 14 to 18): a
 * camp (SetTimeTestData) with Field Day, which starts from the regular day with Lunch break
 * brought in, and Color War, an event with two time blocks and two stations; and the runs,
 * frame changes and file contents the screen sends.
 */
@IsTest
public class SpecialScheduleTestData {
  /** Adds a special day as the screen's blank row does: it starts from the regular day. */
  public static Id addDay(Id seasonId, String name) {
    return SetupTablesController.saveRow(
        new SpecialDay__c(Season__c = seasonId, Name = name, SortOrder__c = 1),
        null,
        null
      )
      .id;
  }

  public static Id addEvent(Id seasonId, String name) {
    SpecialEvent__c event = new SpecialEvent__c(
      Season__c = seasonId,
      Name = name
    );
    Database.insert(event, AccessLevel.USER_MODE);
    return event.Id;
  }

  /** A special day with Lunch break brought in for every group, in a camp with three groups. */
  public static Map<String, Id> campWithFieldDay() {
    Map<String, Id> ids = SetTimeTestData.camp();
    SetTimeTestData.save(
      new List<SObject>{ SetTimeTestData.fixed(ids, 'Lunch break', 'Lunch') }
    );
    ids.put('Field Day', addDay(ids.get('Season'), 'Field Day'));
    return ids;
  }

  /** A run over cells that were empty when the director saw them. */
  public static SlotEdits.Run run(
    String groupId,
    List<String> blockIds,
    List<String> after
  ) {
    SlotEdits.Run run = new SlotEdits.Run();
    run.day = SpecialSchedule.PLAN_DAY;
    run.groupId = groupId;
    run.firstBlockId = blockIds[0];
    run.blockIds = blockIds;
    run.before = new List<String>();
    for (String cell : after) {
      run.before.add('');
    }
    run.after = after;
    return run;
  }

  public static List<SlotEdits.Edit> edits(SlotEdits.Run run) {
    SlotEdits.Edit edit = new SlotEdits.Edit();
    edit.runs = new List<SlotEdits.Run>{ run };
    return new List<SlotEdits.Edit>{ edit };
  }

  public static SpecialScheduleFrame.Change change(
    String action,
    String targetId,
    String name
  ) {
    SpecialScheduleFrame.Change change = new SpecialScheduleFrame.Change();
    change.action = action;
    change.targetId = targetId;
    change.name = name;
    return change;
  }

  public static SpecialScheduleFrame.Change block(
    String name,
    String startTime,
    String endTime
  ) {
    SpecialScheduleFrame.Change change = change('addBlock', null, name);
    change.startTime = startTime;
    change.endTime = endTime;
    return change;
  }

  public static SpecialScheduleFrame.Change move(
    String action,
    String targetId,
    Integer direction
  ) {
    SpecialScheduleFrame.Change change = change(action, targetId, null);
    change.direction = direction;
    return change;
  }

  /** What the day shows, one line per row: "Group A: Swim,^,Lunch break". */
  public static List<String> cells(ScheduleViews.DayView day) {
    List<String> result = new List<String>();
    for (Integer g = 0; g < day.groups.size(); g++) {
      List<String> names = new List<String>();
      List<String> row = day.blocks.isEmpty()
        ? new List<String>()
        : day.rows[g].split(',', -1);
      for (String cell : row) {
        names.add(
          String.isBlank(cell) || cell == ScheduleGrid.CARRIES_ON
            ? cell
            : day.items[Integer.valueOf(cell) - 1].name
        );
      }
      result.add(day.groups[g].name + ': ' + String.join(names, ','));
    }
    return result;
  }

  public static List<String> blockNames(ScheduleViews.DayView day) {
    List<String> result = new List<String>();
    for (ScheduleViews.Ref block : day.blocks) {
      result.add(block.id + ' ' + block.name);
    }
    return result;
  }

  /** Color War: Relays (9:50) then a time block of 9:00 placed before it; Blue and Gold across. */
  public static Id colorWar(Map<String, Id> ids) {
    Id eventId = addEvent(ids.get('Season'), 'Color War');
    SpecialScheduleController.changeFrame(
      eventId,
      null,
      block('Relays', '09:50', '11:20')
    );
    SpecialScheduleController.changeFrame(
      eventId,
      1,
      block('', '9:00', '09:45')
    );
    SpecialScheduleController.changeFrame(
      eventId,
      2,
      change('addStation', null, ' Blue ')
    );
    SpecialScheduleController.changeFrame(
      eventId,
      3,
      change('addStation', null, 'Gold')
    );
    return eventId;
  }

  public static SpecialScheduleImport.ImportedBlock importedBlock(
    String name,
    String startTime,
    String endTime
  ) {
    SpecialScheduleImport.ImportedBlock block = new SpecialScheduleImport.ImportedBlock();
    block.name = name;
    block.startTime = startTime;
    block.endTime = endTime;
    return block;
  }

  public static SpecialScheduleImport.ImportedColumn column(
    String name,
    List<String> cells
  ) {
    SpecialScheduleImport.ImportedColumn column = new SpecialScheduleImport.ImportedColumn();
    column.name = name;
    column.cells = cells;
    return column;
  }

  public static SpecialScheduleImport.Imported sportsDay(
    List<SpecialScheduleImport.ImportedColumn> columns
  ) {
    SpecialScheduleImport.Imported imported = new SpecialScheduleImport.Imported();
    imported.blocks = new List<SpecialScheduleImport.ImportedBlock>{
      importedBlock('', '09:00', '09:45'),
      importedBlock('Stations', '09:50', '11:20')
    };
    imported.columns = columns;
    return imported;
  }
}
