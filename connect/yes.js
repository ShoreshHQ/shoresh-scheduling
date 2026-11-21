/**
 * The person's own yes (API-1.153). Over MCP the AI never holds a confirm: when Shoresh asks first
 * (API-1.106), the connector shows Shoresh's own words in a dialog on the person's screen, and only
 * their click on Yes sends the confirm. What the AI reads, camp data included, can't click it.
 * The command line and code mode stay as API-1.112 says: whoever types the command is the person.
 */
const { execFile } = require("child_process");
const { NOT_YET } = require("./client");

// Under the 60 seconds an AI app waits for one answer, so a late Yes never does what the AI was
// told didn't happen.
const WAIT_SECONDS = 50;

// How Shoresh hands back the confirm, at the very end of its answer (AgentAskFirst.question).
const CONFIRM_AT_END = /confirm: "([^"\s]+)"\.$/;
const INSTRUCTION = " Show the person";

/** The confirm at the end of Shoresh's answer and its words without it; confirm null when none. */
function split(text) {
  const said = String(text ?? "");
  const found = said.match(CONFIRM_AT_END);
  const cut = said.lastIndexOf(INSTRUCTION);
  if (!found || cut < 0) return { words: said, confirm: null };
  return { words: said.slice(0, cut), confirm: found[1] };
}

/**
 * Asks the person in a dialog of the computer's own (macOS) with Shoresh's words: "yes", "no", or
 * "no answer" after WAIT_SECONDS; "unasked" where there is no such dialog yet. The words go in as
 * an argument, never as AppleScript, so camp data can't change the dialog.
 */
function askPerson(
  words,
  { run = execFile, platform = process.platform } = {}
) {
  if (platform !== "darwin") return Promise.resolve("unasked");
  const dialog = `display dialog (item 1 of argv) with title "Shoresh" buttons {"Cancel", "Yes"} default button "Cancel" cancel button "Cancel" with icon caution giving up after ${WAIT_SECONDS}`;
  return new Promise((resolve) => {
    run(
      "osascript",
      ["-e", "on run argv", "-e", dialog, "-e", "end run", words],
      { timeout: (WAIT_SECONDS + 10) * 1000 },
      (error, stdout) => {
        if (error) resolve(error.killed ? "no answer" : "no");
        else if (/gave up:true/.test(stdout)) resolve("no answer");
        else resolve(/button returned:Yes\b/.test(stdout) ? "yes" : "no");
      }
    );
  });
}

const AGAIN =
  "If the person wants it, send the same request again (without confirm): Shoresh asks them on their screen.";

const NOT_ASKED = {
  no: "Nothing was done: the person said no on their screen to:",
  "no answer": `Nothing was done: the person didn't answer on their screen within ${WAIT_SECONDS} seconds. It was:`,
  unasked:
    "Nothing was done: Shoresh can't ask the person for their yes on this computer yet, so they can do it on Shoresh's own screen in Salesforce. It was:"
};

/** An answer for the AI with no confirm in it: the words, and how the person's yes is asked. */
function withoutConfirm(said, then = AGAIN) {
  const { words, confirm } = split(said?.text);
  return confirm ? { ...said, text: `${words} ${then}` } : said;
}

/**
 * One ask-first action as the AI asks it over MCP: the AI's confirm, if any, is dropped; Shoresh's
 * preview is shown to the person; on their Yes the same request goes again with Shoresh's confirm.
 * In a script (inScript) nobody is asked: the preview comes back, to call the tool on its own.
 */
async function withPersonsYes(
  name,
  input,
  { act, ask = askPerson, inScript = false, log = () => {} }
) {
  const { confirm: dropped, ...asked } = input ?? {};
  if (dropped !== undefined)
    log(`Shoresh: left out the confirm the AI sent with ${name}`);
  const first = await act(asked);
  const { words, confirm } = split(first?.text);
  if (!first?.ok || !first.asksFirst || !confirm) return withoutConfirm(first);
  if (inScript) {
    return withoutConfirm(
      first,
      `To do it, call ${name} on its own (not in a script): Shoresh asks the person on their screen.`
    );
  }
  const shown = words.startsWith(NOT_YET)
    ? words.slice(NOT_YET.length).trim()
    : words;
  const answer = await ask(shown);
  log(`Shoresh: the person's answer to ${name}: ${answer}`);
  if (answer !== "yes") {
    return { ok: false, text: `${NOT_ASKED[answer]} ${shown}` };
  }
  return withoutConfirm(await act({ ...asked, confirm }));
}

/** What an ask-first tool's description says over MCP, in place of the confirm's instructions. */
const ASKS_ON_SCREEN =
  " Shoresh asks first, on the person's own screen: it shows them in plain words what this would do, and does it only when they click Yes there. Never ask them to type or say a yes to you instead; if they say no, nothing was done.";

module.exports = {
  split,
  askPerson,
  withPersonsYes,
  withoutConfirm,
  ASKS_ON_SCREEN,
  WAIT_SECONDS
};
