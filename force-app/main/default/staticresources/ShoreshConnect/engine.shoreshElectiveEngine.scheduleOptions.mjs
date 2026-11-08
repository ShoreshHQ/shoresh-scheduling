import { FIELD } from "./engine.shoreshSchema.shoreshSchema.mjs";

const SCHEDULE = FIELD.Schedule;

/**
 * A week's schedules electives can be worked against, named so a person can tell them apart:
 * "Generated Schedule · Published", with the program first when the camp has more than one.
 * Versions are not offered.
 */
export function scheduleOptions(setup, weekId) {
  if (!setup || !weekId) return [];
  const programs = new Map(
    (setup.programs || []).map((p) => [p.program.Id, p.program.Name])
  );
  const many = programs.size > 1;
  return (setup.schedules || [])
    .filter(
      (s) => s[SCHEDULE.Week] === weekId && s[SCHEDULE.Status] !== "Version"
    )
    .map((s) => {
      const kind =
        s[SCHEDULE.Origin] === "Generated"
          ? "Generated Schedule"
          : "Manual Build";
      const published =
        s[SCHEDULE.Status] === "Published" ? " · Published" : "";
      return {
        label: `${many ? `${programs.get(s[SCHEDULE.Program])} · ` : ""}${kind}${published}`,
        value: s.Id,
        programId: s[SCHEDULE.Program]
      };
    });
}
