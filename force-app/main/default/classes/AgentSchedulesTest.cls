/**
 * Each screen's own action, chosen once (AgentSchedules, AgentScreenVersions; docs/protocol/api.md
 * API-1.41 to API-1.43): a Manual Build week reaches ManualBuildController's action and a
 * Generated Schedule week Generated Schedule's, on GeneratedTestData's camp (Week 1 of Main has
 * both). Each screen's save refuses the other's draft, so an action done on both proves which ran.
 */
@IsTest
private class AgentSchedulesTest {
  private static Id generatedId;
  private static Id manualId;

  /** Week 1 of Main with both schedules, as the scheduler made them. */
  private static void bothSchedules() {
    GeneratedTestData.camp();
    generatedId = GeneratedTestData.generated();
    manualId = ManualDrafts.start(
        GeneratedTestData.ids.get('Main'),
        GeneratedTestData.ids.get('Week 1')
      )
      .draftId;
  }

  /** Week 1 of Main on one screen, its draft locked as AgentSchedules.eitherOf locks it. */
  private static AgentWeeks.Week weekOn(Boolean manual, Id draftId) {
    Map<String, Id> ids = GeneratedTestData.ids;
    AgentWeeks.Week week = new AgentWeeks.Week();
    week.manual = manual;
    week.name = 'Week 1';
    week.weekId = ids.get('Week 1');
    week.program = new Program__c(Id = ids.get('Main'), Name = 'Main');
    week.season = new Season__c(Id = ids.get('Season'));
    if (draftId != null) {
      week.draft = manual
        ? ManualDrafts.locked(draftId)
        : GeneratedDrafts.lockedToEdit(draftId);
    }
    return week;
  }

  /** Group A's Monday Period 2 changed from was to Soccer, as the connector sends it. */
  private static SlotEdits.Edit soccerOver(String was) {
    Map<String, Id> ids = GeneratedTestData.ids;
    SlotEdits.Edit edit = new SlotEdits.Edit();
    edit.runs = AgentCells.runsOf(
      new List<Object>{
        new Map<String, Object>{
          'day' => '2026-06-29',
          'groupId' => ids.get('Group A'),
          'firstBlockId' => ids.get('Period 2'),
          'blockIds' => new List<Object>{ ids.get('Period 2') },
          'before' => new List<Object>{ was },
          'after' => new List<Object>{ GeneratedTestData.a('Soccer') }
        }
      }
    );
    return edit;
  }

  private static String periodTwo(Id draftId) {
    return GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0))[
      GeneratedTestData.PERIOD_2
    ];
  }

  private static Integer versionsCalled(String name, String origin) {
    return [
      SELECT COUNT()
      FROM Schedule__c
      WHERE Name = :name AND Origin__c = :origin AND Status__c = 'Version'
      WITH SYSTEM_MODE
    ];
  }

  // API-1.42
  @IsTest
  static void saveEditIsEachScreensOwnSave() {
    System.runAs(ShoreshTestData.scheduler()) {
      bothSchedules();
      String seen = WeekTickets.stamp(ScheduleDays.read(generatedId));
      Test.startTest();
      SlotEdits.Result manual = AgentSchedules.saveEdit(
        weekOn(true, manualId),
        null,
        soccerOver('')
      );
      SlotEdits.Result generated = AgentSchedules.saveEdit(
        weekOn(false, generatedId),
        seen,
        soccerOver(GeneratedTestData.a('Gym games'))
      );
      Test.stopTest();
      Assert.isTrue(manual.conflicts.isEmpty());
      Assert.isTrue(generated.conflicts.isEmpty());
      Assert.areEqual(GeneratedTestData.a('Soccer'), periodTwo(manualId));
      Assert.areEqual(GeneratedTestData.a('Soccer'), periodTwo(generatedId));
    }
  }

  // API-1.65
  @IsTest
  static void keepVersionIsEachScreensOwnKeep() {
    System.runAs(ShoreshTestData.scheduler()) {
      bothSchedules();
      Test.startTest();
      AgentScreenVersions.keepVersion(
        weekOn(true, manualId),
        'Before rainy Monday'
      );
      AgentScreenVersions.keepVersion(
        weekOn(false, generatedId),
        'Before rainy Tuesday'
      );
      Test.stopTest();
      Assert.areEqual(
        1,
        versionsCalled('Before rainy Monday', ManualDrafts.MANUAL)
      );
      Assert.areEqual(
        1,
        versionsCalled('Before rainy Tuesday', GeneratedDrafts.GENERATED)
      );
    }
  }

  // API-1.43
  @IsTest
  static void saveVersionIsEachScreensOwnSave() {
    System.runAs(ShoreshTestData.scheduler()) {
      bothSchedules();
      Test.startTest();
      AgentScreenVersions.saveVersion(weekOn(true, manualId), 'Before trip');
      AgentScreenVersions.saveVersion(weekOn(false, generatedId), 'After trip');
      Test.stopTest();
      Assert.areEqual(1, versionsCalled('Before trip', ManualDrafts.MANUAL));
      Assert.areEqual(
        1,
        versionsCalled('After trip', GeneratedDrafts.GENERATED)
      );
    }
  }

  // API-1.43
  @IsTest
  static void deleteVersionIsEachScreensOwnDelete() {
    System.runAs(ShoreshTestData.scheduler()) {
      bothSchedules();
      Id manualVersion = ManualBuildController.saveVersion(
        manualId,
        'Before trip'
      );
      Id generatedVersion = GeneratedScheduleController.saveVersion(
        generatedId,
        'After trip'
      );
      Test.startTest();
      AgentScreenVersions.deleteVersion(weekOn(true, manualId), manualVersion);
      AgentScreenVersions.deleteVersion(
        weekOn(false, generatedId),
        generatedVersion
      );
      Test.stopTest();
      Assert.areEqual(0, versionsCalled('Before trip', ManualDrafts.MANUAL));
      Assert.areEqual(
        0,
        versionsCalled('After trip', GeneratedDrafts.GENERATED)
      );
    }
  }

  // API-1.43
  @IsTest
  static void restoreVersionIsEachScreensOwnRestore() {
    System.runAs(ShoreshTestData.scheduler()) {
      bothSchedules();
      Id manualVersion = ManualBuildController.saveVersion(
        manualId,
        'Before trip'
      );
      Id generatedVersion = GeneratedScheduleController.saveVersion(
        generatedId,
        'After trip'
      );
      Test.startTest();
      Boolean manual = AgentScreenVersions.restoreVersion(
        weekOn(true, manualId),
        manualVersion
      );
      Boolean generated = AgentScreenVersions.restoreVersion(
        weekOn(false, generatedId),
        generatedVersion
      );
      Test.stopTest();
      Assert.isTrue(manual);
      Assert.isTrue(generated);
      // Each screen's own Restore keeps its week first as "Before Restore".
      Assert.areEqual(
        1,
        versionsCalled(ManualVersions.BEFORE_RESTORE, ManualDrafts.MANUAL)
      );
      Assert.areEqual(
        1,
        versionsCalled(ManualVersions.BEFORE_RESTORE, GeneratedDrafts.GENERATED)
      );
    }
  }

  // API-1.34, API-1.41: on a week not built yet, Generated Schedule's Restore makes the version its
  // first; Manual Build's has none before the week is started there.
  @IsTest
  static void aWeekNotBuiltYetIsRestoredOnlyOnGeneratedSchedule() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      manualId = ManualDrafts.start(
          GeneratedTestData.ids.get('Main'),
          GeneratedTestData.ids.get('Week 1')
        )
        .draftId;
      Id manualVersion = ManualBuildController.saveVersion(
        manualId,
        'Before trip'
      );
      AgentWeeks.Week notStarted = weekOn(true, null);
      AgentWeeks.Week notBuilt = weekOn(false, null);
      Test.startTest();
      String refused;
      try {
        AgentScreenVersions.requireDraftToRestore(notStarted);
      } catch (ShoreshException e) {
        refused = e.getMessage();
      }
      AgentScreenVersions.requireDraftToRestore(notBuilt);
      Boolean started = AgentScreenVersions.restoreVersion(
        notBuilt,
        manualVersion
      );
      Test.stopTest();
      Assert.areEqual(
        'Week 1 hasn\'t been started on Manual Build for Main yet.',
        refused
      );
      Assert.isTrue(started);
      Assert.areEqual(1, GeneratedTestData.generatedDrafts());
    }
  }
}
