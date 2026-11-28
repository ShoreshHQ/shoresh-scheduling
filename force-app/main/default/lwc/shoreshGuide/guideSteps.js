// Getting started's steps (CORE-6.17): each one a short name and the exact things to click, in
// the words on screen, drawn as a row of buttons; no sentences. The Salesforce clicks are
// Salesforce's own words in November 2026 (docs/try-camp-setup.md section 34). Screen names
// come from c/shoreshScreens, so a camp that calls electives Chugim reads Chugim here too.
import { screenLabels } from "c/shoreshScreens";
import { article, capital } from "c/shoreshTerms";

export const SAMPLE_CAMP_FILE = "Sample camp (made up).xlsx";
export const SAMPLE_ELECTIVES_FILE = "Sample electives (made up).csv";
export const SAMPLE_CHOICES_FILE = "Sample choices (made up).csv";

/** The steps, in order: [{ key, title, who, paths: [[click, ...]], sample }]. */
export function guideSteps(t) {
  const screens = screenLabels(t);
  return [
    {
      key: "people",
      title: "Give people Shoresh",
      who: "Salesforce admin",
      paths: [
        [
          "Setup",
          "Users",
          "The person's name",
          "Permission Set Assignments",
          "Edit Assignments"
        ],
        ["Shoresh Scheduler", "Add", "Save"]
      ]
    },
    {
      // How long a person's AI stays signed in is the camp's call (Greg 2026-11-28): the
      // Salesforce CLI app's refresh token policy, which the connector's sign-in follows.
      key: "aiSignIn",
      title: "AI sign-in",
      who: "Salesforce admin",
      paths: [
        ["Setup", "Connected Apps OAuth Usage", "Salesforce CLI", "Install"],
        ["Edit Policies", "Refresh Token Policy", "Save"]
      ]
    },
    { key: "sample", title: "Sample camp", sample: true, paths: [] },
    {
      key: "season",
      title: capital(article(t.sIn("Season"))),
      // Season actions is the bare ▾ beside the season picker.
      paths: [
        ["▾", `New ${t.sIn("Season")}`, `Create ${t.sIn("Season")}`],
        [screens.roots, screens.import, SAMPLE_CAMP_FILE]
      ]
    },
    {
      key: "week",
      title: `Build ${article(t.sIn("Week"))}`,
      paths: [[screens.generatedSchedule, "Generate a schedule"]]
    },
    {
      key: "electives",
      title: screens.electives,
      paths: [
        // The sample's elective set comes in empty: its list first, then the campers' choices.
        [screens.electives, "Import a list", SAMPLE_ELECTIVES_FILE],
        [
          screens.electiveSeats,
          "Build",
          "Import choices",
          SAMPLE_CHOICES_FILE,
          `Assign ${t.pIn("Seats")}`,
          "Finalize"
        ]
      ]
    },
    {
      key: "publish",
      title: "Publish",
      paths: [[screens.generatedSchedule, "Publish"]]
    }
  ];
}
