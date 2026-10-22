/**
 * A special day's or event's plan while its frame changes (ADR 0014 choice 16): its rows held as
 * cell identities (SlotIds), so what is in a cell moves with its time block or station, then
 * written back as cells, where a placement a change cut in two becomes two. Pure: no queries.
 */
public with sharing class SpecialPlanShape {
  public final ScheduleGrid grid;
  // Each row as cell identities, worked on, then written back by finish().
  private List<List<String>> identities = new List<List<String>>();

  public SpecialPlanShape(ScheduleGrid grid) {
    this.grid = grid;
    for (Integer g = 0; g < grid.rows.size(); g++) {
      identities.add(SlotIds.ofRow(grid, g));
    }
  }

  /** A time block, placed among the others by when it starts, empty in every row. */
  public void addBlock(ScheduleGrid.Block block) {
    Integer at = grid.blocks.size();
    for (Integer b = grid.blocks.size() - 1; b >= 0; b--) {
      if (grid.blocks[b].startTime > block.startTime) {
        at = b;
      }
    }
    if (at == grid.blocks.size()) {
      grid.blocks.add(block);
    } else {
      grid.blocks.add(at, block);
    }
    for (List<String> row : identities) {
      if (at == row.size()) {
        row.add(SlotIds.OPEN);
      } else {
        row.add(at, SlotIds.OPEN);
      }
    }
  }

  /** A time block one place earlier (-1) or later (1); at the end, it stays. */
  public void moveBlock(Integer b, Integer step) {
    Integer other = b + step;
    if (other >= 0 && other < grid.blocks.size()) {
      swapBlocks(b, other);
    }
  }

  private void swapBlocks(Integer b, Integer other) {
    ScheduleGrid.Block moved = grid.blocks[b];
    grid.blocks[b] = grid.blocks[other];
    grid.blocks[other] = moved;
    for (List<String> row : identities) {
      String cell = row[b];
      row[b] = row[other];
      row[other] = cell;
    }
  }

  public void removeBlock(Integer b) {
    grid.blocks.remove(b);
    for (List<String> row : identities) {
      row.remove(b);
    }
  }

  /** A row (an event's station), empty in every time block, after the others. */
  public void addRow(ScheduleGrid.GroupRef station) {
    grid.groups.add(station);
    List<String> row = new List<String>();
    for (ScheduleGrid.Block block : grid.blocks) {
      row.add(SlotIds.OPEN);
    }
    identities.add(row);
  }

  /** A row one place left (-1) or right (1); at the end, it stays. */
  public void moveRow(Integer g, Integer step) {
    Integer other = g + step;
    if (other >= 0 && other < grid.groups.size()) {
      swapRows(g, other);
    }
  }

  private void swapRows(Integer g, Integer other) {
    ScheduleGrid.GroupRef moved = grid.groups[g];
    grid.groups[g] = grid.groups[other];
    grid.groups[other] = moved;
    List<String> row = identities[g];
    identities[g] = identities[other];
    identities[other] = row;
  }

  public void removeRow(Integer g) {
    grid.groups.remove(g);
    identities.remove(g);
  }

  /** Every cell emptied. */
  public void clear() {
    for (List<String> row : identities) {
      for (Integer b = 0; b < row.size(); b++) {
        row[b] = SlotIds.OPEN;
      }
    }
  }

  /** The next id of the plan's own of a kind ("b8", "s3"), never one it has. */
  public String nextId(String prefix) {
    Set<String> taken = new Set<String>(grid.blockIds());
    taken.addAll(grid.groupIds());
    Integer n = 1;
    while (taken.contains(prefix + n)) {
      n++;
    }
    return prefix + n;
  }

  /** The grid with its rows written back from their identities. */
  public ScheduleGrid finish() {
    Map<String, String> tokenOf = new Map<String, String>();
    for (Integer i = grid.items.size() - 1; i >= 0; i--) {
      tokenOf.put(SlotIds.of(grid.items[i]), String.valueOf(i + 1));
    }
    grid.rows = new List<List<String>>();
    for (List<String> row : identities) {
      List<String> cells = new List<String>();
      for (Integer b = 0; b < row.size(); b++) {
        cells.add(cellAt(row, b, tokenOf));
      }
      grid.rows.add(cells);
    }
    // A plan has no locks (only Generated Schedule's days do).
    grid.locks = new List<List<String>>();
    grid.dropUnusedItems();
    return grid;
  }

  /** One cell: empty, carrying on what is above it, or the item starting there. */
  private static String cellAt(
    List<String> row,
    Integer b,
    Map<String, String> tokenOf
  ) {
    String slot = row[b];
    if (slot == SlotIds.OPEN) {
      return SlotIds.OPEN;
    }
    String item = SlotIds.owner(slot);
    Boolean carries =
      SlotIds.isCarryOn(slot) &&
      b > 0 &&
      row[b - 1] != SlotIds.OPEN &&
      SlotIds.owner(row[b - 1]).equals(item);
    return carries ? ScheduleGrid.CARRIES_ON : tokenOf.get(item);
  }
}
