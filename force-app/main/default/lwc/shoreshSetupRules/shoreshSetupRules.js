/**
 * Problems in a season's setup, shown to the scheduler and never fixed silently. Each says what it
 * is about (name), what is wrong (why), and which screen fixes it (screen, see shoreshScreens).
 * Dates are ISO strings (YYYY-MM-DD), which compare correctly as text.
 */
export function setupProblems(setup, terms) {
  if (!setup || !setup.season) {
    return [];
  }
  const problems = [
    ...weekProblems(setup, terms),
    ...structureProblems(setup, terms),
    ...activityProblems(setup, terms)
  ];
  return problems.map((problem, i) => ({ key: `p${i}`, ...problem }));
}

function weekProblems(setup, terms) {
  const problems = [];
  const season = setup.season;
  const weeks = [...(setup.weeks || [])].sort((a, b) => {
    return a.StartDate__c < b.StartDate__c ? -1 : 1;
  });
  const add = (name, why) => problems.push({ screen: "weeks", name, why });
  weeks.forEach((week) => {
    if (
      week.StartDate__c < season.StartDate__c ||
      week.EndDate__c > season.EndDate__c
    ) {
      add(week.Name, `Falls outside the dates of this ${terms.sIn("Season")}.`);
    }
  });
  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i].StartDate__c <= weeks[i - 1].EndDate__c) {
      add(`${weeks[i - 1].Name} and ${weeks[i].Name}`, "Share dates.");
    }
  }
  if (weeks.length === 0) {
    add(season.Name, `No ${terms.pIn("Week")} yet.`);
  }
  return problems;
}

function structureProblems(setup, terms) {
  const problems = [];
  const add = (screen, name, why) => problems.push({ screen, name, why });
  const programs = setup.programs || [];
  if (programs.length === 0) {
    add(
      "programs",
      setup.season.Name,
      `No ${terms.pIn("Program")} yet. Every ${terms.sIn("Season")} needs at least one.`
    );
  }
  programs.forEach((entry) => {
    const name = entry.program.Name;
    if ((entry.timeBlocks || []).length === 0) {
      add("timeBlocks", name, `No ${terms.pIn("TimeBlock")} yet.`);
    }
    if ((entry.divisions || []).length === 0) {
      add("divisions", name, `No ${terms.pIn("Division")} yet.`);
    }
    (entry.divisions || []).forEach((d) => {
      if ((d.groups || []).length === 0) {
        add("groups", d.division.Name, `No ${terms.pIn("Group")} yet.`);
      }
    });
  });
  return problems;
}

/**
 * Activity nudges. None blocks anything. From Shoresh desktop's Roots: no activities yet, and a
 * group no activity is open to. From Greg (2026-10-16): an outdoor activity with no rain plan, and
 * an activity allowing more groups at once than its location fits (the smaller number is what
 * scheduling uses).
 */
function activityProblems(setup, terms) {
  const activities = setup.activities || [];
  if (activities.length === 0) {
    return [
      {
        screen: "activities",
        name: setup.season.Name,
        why: `No ${terms.pIn("Activity")} yet.`
      }
    ];
  }
  const problems = groupsWithNothingToDo(setup, terms);
  const add = (name, why) => problems.push({ screen: "activities", name, why });
  const locations = new Map((setup.locations || []).map((l) => [l.Id, l]));
  activities.forEach((activity) => {
    if (activity.Outdoor__c && !activity.RainPlan__c) {
      add(activity.Name, `Outdoors and has no ${terms.sIn("RainPlan")}.`);
    }
    const location = locations.get(activity.Location__c);
    if (
      location &&
      !activity.NoGroupLimit__c &&
      activity.GroupsAtOnce__c > location.GroupsThatFit__c
    ) {
      add(
        activity.Name,
        `Allows ${activity.GroupsAtOnce__c} ${terms.pIn("Group")} at once, ` +
          `but "${location.Name}" fits ${location.GroupsThatFit__c}. Scheduling uses ` +
          `${location.GroupsThatFit__c}; change whichever number is wrong.`
      );
    }
  });
  return problems;
}

/** Groups that no activity is open to (who can do it: everyone, or chosen divisions and groups). */
function groupsWithNothingToDo(setup, terms) {
  const openTo = (setup.activities || []).map(
    (a) =>
      new Set(
        (a.Eligibilities__r || []).map((e) => e.Division__c || e.Group__c)
      )
  );
  const problems = [];
  (setup.programs || []).forEach((entry) => {
    (entry.divisions || []).forEach((d) => {
      (d.groups || []).forEach((grp) => {
        const canDoOne = openTo.some(
          (who) => who.size === 0 || who.has(grp.Id) || who.has(d.division.Id)
        );
        if (!canDoOne) {
          problems.push({
            screen: "activities",
            name: grp.Name,
            why: `No ${terms.pIn("Activity")} are open to this ${terms.sIn("Group")}.`
          });
        }
      });
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
