/**
 * What a refusal says an AI has for part of a longer placement (docs/protocol/api.md API-1.13,
 * API-1.138): the tools for what the screen's handle can change, none for an event or elective.
 */
public with sharing class AgentCellWords {
  /** What an AI has for a placement the screen's handle can change; an event or elective has none. */
  public static String whatElse(String now, String firstBlock) {
    String owner = SlotIds.owner(now);
    return owner.startsWith(SlotIds.ACTIVITY) || SlotIds.isSetTime(owner)
      ? ' change_cell_length changes its length; from ' +
        firstBlock +
        ', move_cell moves it and take_out_cell takes it all out.'
      : ' Nothing was changed.';
  }
}
