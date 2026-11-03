/**
 * The shared cell examples (staticresources/ShoreshCellExamples.json), which the engine and the
 * week editor must also pass (shoreshEngine cellExamples.test.js): the server reads what a cell
 * holds, and words a locked cell's refusal, as the screen does.
 */
@IsTest
private class CellExamplesTest {
  private static Map<String, Object> examples() {
    String ours = ShoreshSchema.namespace();
    StaticResource read = [
      SELECT Body
      FROM StaticResource
      WHERE Name = 'ShoreshCellExamples' AND NamespacePrefix = :ours
      LIMIT 1
    ];
    return (Map<String, Object>) JSON.deserializeUntyped(read.Body.toString());
  }

  @IsTest
  static void slotIdsReadsTheSharedCells() {
    List<Object> cells = (List<Object>) examples().get('cells');
    Assert.isFalse(cells.isEmpty());
    for (Object each : cells) {
      Map<String, Object> cell = (Map<String, Object>) each;
      String slot = (String) cell.get('slot');
      String name = (String) cell.get('name');
      Assert.areEqual((String) cell.get('owner'), SlotIds.owner(slot), name);
      Assert.areEqual(
        (Boolean) cell.get('carriesOn'),
        SlotIds.isCarryOn(slot),
        name
      );
      Assert.areEqual(
        (Boolean) cell.get('setTime'),
        SlotIds.isSetTime(slot),
        name
      );
      Assert.areEqual(
        (Boolean) cell.get('startsActivity'),
        SlotIds.activityIn(slot) != null,
        name
      );
    }
  }

  @IsTest
  static void aLockedCellIsRefusedInTheScreensWords() {
    List<Object> locked = (List<Object>) examples().get('locked');
    Assert.isFalse(locked.isEmpty());
    for (Object each : locked) {
      Map<String, Object> cell = (Map<String, Object>) each;
      Assert.areEqual(
        (String) cell.get('words'),
        ScheduleGridLocks.lockedWords(
          (String) cell.get('group'),
          (String) cell.get('weekday'),
          (String) cell.get('block')
        )
      );
    }
  }
}
