/**
 * Problems in a season's setup, shown to the scheduler and never fixed silently.
 * Dates are ISO strings (YYYY-MM-DD), which compare correctly as text.
 */
export function setupProblems(setup, terms) {
  if (!setup || !setup.season) {
    return [];
  }
  const problems = [];
  const season = setup.season;
  const weeks = [...(setup.weeks || [])].sort((a, b) => {
    return a.StartDate__c < b.StartDate__c ? -1 : 1;
  });

  weeks.forEach((week) => {
    if (
      week.StartDate__c < season.StartDate__c ||
      week.EndDate__c > season.EndDate__c
    ) {
      problems.push(
        `"${week.Name}" falls outside the dates of this ${terms.sIn("Season")}.`
      );
    }
  });
  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i].StartDate__c <= weeks[i - 1].EndDate__c) {
      problems.push(
        `"${weeks[i - 1].Name}" and "${weeks[i].Name}" share dates.`
      );
    }
  }
  if (weeks.length === 0) {
    problems.push(
      `This ${terms.sIn("Season")} has no ${terms.pIn("Week")} yet.`
    );
  }
  if ((setup.programs || []).length === 0) {
    problems.push(
      `This ${terms.sIn("Season")} has no ${terms.pIn("Program")} yet. Every ${terms.sIn("Season")} needs at least one.`
    );
  }
  (setup.programs || []).forEach((entry) => {
    const name = entry.program.Name;
    if ((entry.timeBlocks || []).length === 0) {
      problems.push(`"${name}" has no ${terms.pIn("TimeBlock")} yet.`);
    }
    if ((entry.divisions || []).length === 0) {
      problems.push(`"${name}" has no ${terms.pIn("Division")} yet.`);
    }
    (entry.divisions || []).forEach((d) => {
      if ((d.groups || []).length === 0) {
        problems.push(`"${d.division.Name}" has no ${terms.pIn("Group")} yet.`);
      }
    });
  });
  return problems;
}

/** "Summer 2026" copied to a 2027 start becomes "Summer 2027"; otherwise "<name> (copy)". */
export function suggestedCopyName(name, oldStartDate, newStartDate) {
  const oldYear = (oldStartDate || "").slice(0, 4);
  const newYear = (newStartDate || "").slice(0, 4);
  if (oldYear && newYear && oldYear !== newYear && name.includes(oldYear)) {
    return name.split(oldYear).join(newYear);
  }
  return `${name} (copy)`;
}

/** The same weekday about a year later: 52 weeks on. */
export function suggestedCopyStart(oldStartDate) {
  const [y, m, d] = oldStartDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + 364));
  return date.toISOString().slice(0, 10);
}
