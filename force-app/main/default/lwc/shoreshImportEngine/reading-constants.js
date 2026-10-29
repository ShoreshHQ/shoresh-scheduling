export const LEAVE_OUT = "leaveOut";

/** DIV-1.1: the answer to a division question that puts the group in no division. */
export const NO_DIVISION = "__noDivision";

/** The timetable block indexes a usable placement fills, first to last (a double period's both). */
export function blocksOf(p) {
  return (
    p.blocks || Array.from({ length: p.span || 1 }, (_, k) => p.blockIndex + k)
  );
}

/** INGEST-2.19: the answer that adds an activity shown only by colour, with no times yet. */
export const COLOUR_ADD = "add";
