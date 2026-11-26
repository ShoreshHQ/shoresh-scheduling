/**
 * The person's own yes (API-1.153). Over MCP the AI never holds a confirm: when Shoresh asks first
 * (API-1.106), the connector shows Shoresh's own words in a dialog on the person's screen, and only
 * their click on Yes sends the confirm. What the AI reads, camp data included, can't click it.
 * The command line and code mode stay as API-1.112 says: whoever types the command is the person.
 */
const { execFile } = require("child_process");

// The dialog closes this many seconds after the tool call came in, at the latest: the Yes's own
// call still fits in the 60 seconds an AI app waits for one answer, so a late Yes never does what
// the AI was told didn't happen. Under SHORTEST seconds left, nobody is asked.
const WAIT_SECONDS = 45;
const SHORTEST = 10;

/**
 * Asks the person in a dialog of the computer's own, brought to the front, with Shoresh's words:
 * "yes", "no" (Cancel or No, or closed), "no answer" after seconds, "unshown" when the dialog
 * couldn't be shown, "unasked" where there is no such dialog. The words never go in as script, so
 * camp data can't change the dialog: macOS, osascript's display dialog with the words as an
 * argument after --; Windows, WScript.Shell's Popup through PowerShell with the words in an
 * environment variable; Linux, zenity with the words as an argument, its markup off.
 */
function askPerson(
  words,
  seconds = WAIT_SECONDS,
  { run = execFile, platform = process.platform, env = process.env } = {}
) {
  if (platform === "win32") return askOnWindows(words, seconds, run, env);
  if (platform === "linux") return askOnLinux(words, seconds, run, env);
  if (platform !== "darwin") return Promise.resolve("unasked");
  const dialog = `display dialog (item 1 of argv) with title "Shoresh" buttons {"Cancel", "Yes"} default button "Cancel" cancel button "Cancel" with icon caution giving up after ${seconds}`;
  return new Promise((resolve) => {
    run(
      "osascript",
      [
        ...["-e", "on run argv", "-e", "activate", "-e", dialog],
        ...["-e", "end run", "--", words]
      ],
      { timeout: (seconds + 2) * 1000 },
      (error, stdout, stderr) => {
        // Cancel is AppleScript's "User canceled" (-128); any other failure asked nobody.
        if (error) {
          if (error.killed) resolve("no answer");
          else resolve(/\(-128\)/.test(String(stderr)) ? "no" : "unshown");
        } else if (/gave up:true/.test(stdout)) resolve("no answer");
        else resolve(/button returned:Yes\b/.test(stdout) ? "yes" : "no");
      }
    );
  });
}

// Popup's buttons Yes and No (4), a warning icon (48), No the default (256), in front of every
// window (4096). It answers 6 for Yes, 7 for No or closed, -1 when it gave up.
const POPUP = 4 + 48 + 256 + 4096;

function askOnWindows(words, seconds, run, env) {
  const root = env.SystemRoot || env.SYSTEMROOT || "C:\\Windows";
  const powershell = `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
  const script = `(New-Object -ComObject WScript.Shell).Popup($env:SHORESH_QUESTION, ${seconds}, 'Shoresh', ${POPUP})`;
  return new Promise((resolve) => {
    run(
      powershell,
      // Not windowsHide: Windows would start the dialog hidden too. PowerShell hides its own
      // console window instead.
      [
        ...["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden"],
        ...["-Command", script]
      ],
      {
        timeout: (seconds + 5) * 1000,
        env: { ...env, SHORESH_QUESTION: words }
      },
      (error, stdout) => {
        const said = String(stdout ?? "").trim();
        if (error) resolve(error.killed ? "no answer" : "unshown");
        else if (said === "6") resolve("yes");
        else if (said === "7") resolve("no");
        else if (said === "-1") resolve("no answer");
        else resolve("unshown");
      }
    );
  });
}

function askOnLinux(words, seconds, run, env) {
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return Promise.resolve("unshown");
  return new Promise((resolve) => {
    run(
      "zenity",
      [
        "--question",
        "--title=Shoresh",
        "--no-markup",
        "--ok-label=Yes",
        "--cancel-label=Cancel",
        "--default-cancel",
        `--timeout=${seconds}`,
        `--text=${words}`
      ],
      { timeout: (seconds + 5) * 1000 },
      (error, stdout, stderr) => {
        // zenity: 0 Yes, 1 Cancel or closed, 5 gave up; not installed, no such dialog here.
        if (!error) resolve("yes");
        else if (error.code === "ENOENT") resolve("unasked");
        else if (error.killed || error.code === 5) resolve("no answer");
        else if (
          error.code === 1 &&
          !/cannot open display|unknown option/i.test(String(stderr))
        )
          resolve("no");
        else resolve("unshown");
      }
    );
  });
}

const AGAIN =
  "If the person wants it, send the same request again (without confirm): Shoresh asks them on their screen.";

const NOT_ASKED = {
  no: "Nothing was done: the person said no on their screen to:",
  "no answer":
    "Nothing was done: the person didn't answer on their screen in time. It was:",
  unshown:
    "Nothing was done: Shoresh couldn't show the person the question on their screen. It was:",
  late: "Nothing was done: reading the camp took too long to leave the person time to answer on their screen. It was:",
  unasked:
    "Nothing was done: Shoresh can't ask the person for their yes on this computer yet, so they can do it on Shoresh's own screen in Salesforce. It was:"
};

/**
 * An answer for the AI with no confirm in it: when Shoresh asked first (its parts, client.js
 * askedIn), what it said and how the person's yes is asked.
 */
function withoutConfirm(said, then = AGAIN) {
  if (!said?.asks) return said;
  const { asks, ...rest } = said;
  return { ...rest, text: `${asks.said} ${then}` };
}

/**
 * One ask-first action as the AI asks it over MCP: the AI's confirm, if any, is dropped; Shoresh's
 * preview is shown to the person; on their Yes the same request goes again with Shoresh's confirm.
 * In a script (inScript) nobody is asked: the preview comes back, to call the tool on its own.
 */
async function withPersonsYes(
  name,
  input,
  { act, ask = askPerson, inScript = false, log = () => {}, now = Date.now }
) {
  const started = now();
  const { confirm: dropped, ...asked } = input ?? {};
  if (dropped !== undefined)
    log(`Shoresh: left out the confirm the AI sent with ${name}`);
  const first = await act(asked);
  if (!first?.ok || !first.asksFirst) return withoutConfirm(first);
  if (inScript) {
    return withoutConfirm(
      first,
      `To do it, call ${name} on its own (not in a script): Shoresh asks the person on their screen.`
    );
  }
  const { preview: shown, confirm } = first.asks;
  const left = Math.floor(WAIT_SECONDS - (now() - started) / 1000);
  const answer = left < SHORTEST ? "late" : await ask(shown, left);
  log(`Shoresh: the person's answer to ${name}: ${answer}`);
  if (answer !== "yes") {
    return { ok: false, text: `${NOT_ASKED[answer]} ${shown}` };
  }
  return withoutConfirm(await act({ ...asked, confirm }));
}

module.exports = {
  askPerson,
  withPersonsYes,
  WAIT_SECONDS
};
