/**
 * The frame of a special day's or event's own schedule (ADR 0014 choice 16): its time blocks
 * (added, changed, moved, taken out) and an event's stations or teams across (the same), and
 * Clear, which empties every cell. A special day's columns are the camp's groups and are not
 * edited here. Each change names the revision the screen read the plan at and is refused if
 * someone saved it since (SpecialPlans), so nothing is changed on a picture that is out of date.
 * What is in a cell moves with its time block or station (SpecialPlanShape). Runs in user mode.
 */
public with sharing class SpecialScheduleFrame {
  private final SpecialSchedule.Owner owner;
  private final CampLabels labels;
  private final SpecialPlanShape shape;

  /** One change, as the screen sends it. */
  public class Change {
    /**
     * addBlock, changeBlock, moveBlock, removeBlock; addStation, renameStation, moveStation,
     * removeStation; clear.
     */
    @AuraEnabled
    public String action { get; set; }
    /** The time block or station changed (its id in the plan). */
    @AuraEnabled
    public String targetId { get; set; }
    @AuraEnabled
    public String name { get; set; }
    /** "HH:mm". */
    @AuraEnabled
    public String startTime { get; set; }
    @AuraEnabled
    public String endTime { get; set; }
    /** -1 (earlier, or left) or 1 (later, or right). */
    @AuraEnabled
    public Integer direction { get; set; }
  }

  private SpecialScheduleFrame(SpecialSchedule.Owner owner, ScheduleGrid grid) {
    this.owner = owner;
    this.labels = CampLabels.forCamp(owner.campId);
    this.shape = new SpecialPlanShape(grid);
  }

  /** Makes the change; refused, with nothing saved, when the plan was saved since. */
  public static SpecialSchedule.PlanView apply(
    Id itemId,
    Integer revision,
    Change change
  ) {
    if (change == null || String.isBlank(change.action)) {
      throw unreadable();
    }
    SpecialSchedule.Owner owner = SpecialSchedule.lockedOwnerOf(itemId);
    SpecialPlans.Plan plan = SpecialPlans.read(itemId);
    SpecialScheduleFrame frame = new SpecialScheduleFrame(
      owner,
      plan.grid == null ? SpecialSchedule.emptyGrid(owner, null) : plan.grid
    );
    frame.checkCurrent(plan, revision);
    frame.make(change);
    SpecialPlans.write(itemId, frame.shape.finish(), plan.revision);
    return SpecialSchedule.reread(owner);
  }

  /** Refused when the plan can't be read, or was saved since the screen read it. */
  private void checkCurrent(SpecialPlans.Plan plan, Integer revision) {
    if (plan.problem != null) {
      throw new ShoreshException(
        'This schedule could not be read: ' + plan.problem + '.'
      );
    }
    if (plan.revision != revision) {
      throw new ShoreshException(
        'Someone else changed this ' +
          labels.singularInSentence(owner.term) +
          ' since you opened it. Open it again to see their changes, then make yours.'
      );
    }
  }

  private void make(Change change) {
    if (change.action.endsWith('Block')) {
      changeBlocks(change);
    } else if (change.action.endsWith('Station')) {
      changeStations(change);
    } else if (change.action == 'clear') {
      shape.clear();
    } else {
      throw unreadable();
    }
  }

  // ---------- time blocks ----------

  private void changeBlocks(Change change) {
    ScheduleGrid grid = shape.grid;
    switch on change.action {
      when 'addBlock' {
        shape.addBlock(
          SpecialPlanClock.timed(
            new ScheduleGrid.Block(shape.nextId('b'), ''),
            change
          )
        );
      }
      when 'changeBlock' {
        SpecialPlanClock.timed(grid.blocks[blockAt(change.targetId)], change);
      }
      when 'moveBlock' {
        shape.moveBlock(blockAt(change.targetId), step(change));
      }
      when 'removeBlock' {
        removeBlock(blockAt(change.targetId));
      }
      when else {
        throw unreadable();
      }
    }
  }

  private void removeBlock(Integer b) {
    if (shape.grid.blocks.size() == 1 && !shape.grid.groups.isEmpty()) {
      throw new ShoreshException(
        'This schedule needs at least one ' +
          labels.singularInSentence('TimeBlock') +
          '. Add another first.'
      );
    }
    shape.removeBlock(b);
  }

  private Integer blockAt(String blockId) {
    Integer b = SpecialPlanIds.indexOf(shape.grid.blockIds(), blockId);
    if (b < 0) {
      throw changedSince();
    }
    return b;
  }

  // ---------- stations (an event's columns) ----------

  private void changeStations(Change change) {
    eventOnly();
    if (change.action == 'addStation') {
      shape.addRow(
        new ScheduleGrid.GroupRef(
          shape.nextId('s'),
          SpecialActivities.checkedName(change.name)
        )
      );
      return;
    }
    Integer g = SpecialPlanIds.indexOf(shape.grid.groupIds(), change.targetId);
    if (g < 0) {
      throw changedSince();
    }
    switch on change.action {
      when 'renameStation' {
        shape.grid.groups[g].name = SpecialActivities.checkedName(change.name);
      }
      when 'moveStation' {
        shape.moveRow(g, step(change));
      }
      when 'removeStation' {
        shape.removeRow(g);
      }
      when else {
        throw unreadable();
      }
    }
  }

  /** A special day's columns are the camp's groups: they are changed in setup, not here. */
  private void eventOnly() {
    if (!owner.isEvent()) {
      throw new ShoreshException(
        'A ' +
          labels.singularInSentence('SpecialDay') +
          ' has a column for every ' +
          labels.singularInSentence('Group') +
          ' in camp.'
      );
    }
  }

  // ---------- small things ----------

  /** A move's step: -1 or 1. */
  private static Integer step(Change change) {
    if (change.direction == null || Math.abs(change.direction) != 1) {
      throw unreadable();
    }
    return change.direction;
  }

  private static ShoreshException unreadable() {
    return new ShoreshException('That change could not be read.');
  }

  private static ShoreshException changedSince() {
    return new ShoreshException(
      'That was changed by someone else since. Reload the page.'
    );
  }
}
