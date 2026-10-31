/**
 * The prompt the "Connect your AI" card copies (API-1.15, API-1.16): written for the AI, which
 * does the whole setup; the person only signs in in their browser. It names this camp's
 * Salesforce by its My Domain host and nothing else: never a sign-in link, code or token.
 */

// The connector, straight from the repo on GitHub as a file download: no npm publishing, and no
// git needed on the person's computer (a github: address would need git).
const PACKAGE =
  "https://github.com/ShoreshHQ/shoresh-scheduling/archive/refs/heads/main.tar.gz";

/**
 * This org's My Domain host from the page's own host (Lightning pages are served from
 * <name>.lightning.force.com; the sign-in host is <name>.my.salesforce.com, sandboxes and scratch
 * orgs included). null for any other host.
 */
export function myDomainHost(pageHost) {
  const m =
    /^([a-z0-9-]+(\.[a-z0-9-]+)?)\.(lightning\.force|my\.salesforce)\.com$/i.exec(
      pageHost || ""
    );
  return m ? `${m[1].toLowerCase()}.my.salesforce.com` : null;
}

export function connectPrompt(host) {
  const args = `"-y", "${PACKAGE}", "--org", "shoresh"`;
  return `Please connect me to Shoresh, my camp's scheduling app in Salesforce, so you can read and change our camp's schedules for me. Please do the setup yourself by running the commands below on this computer. I will only click in my web browser when Salesforce asks me to sign in.

My camp's Salesforce: ${host}

If you can't run commands on this computer, stop and tell me: "I can't set this up from here. Paste the same message into Claude Code (the Code tab in Claude's desktop app) or Cursor."
Never use sudo or ask for my computer's password; if a step needs that, use the message for that step instead.

1. Run: node --version
   If Node.js is missing or older than version 20, stop and tell me: "Your computer needs Node.js first. Install the LTS version from https://nodejs.org, then paste the same message to me again."

2. Run: sf --version
   If the Salesforce command line is missing, install it: npm install --global @salesforce/cli
   If that fails, stop and tell me: "Your computer needs the Salesforce command line. Install it from https://developer.salesforce.com/tools/salesforcecli, then paste the same message to me again."

3. Tell me: "A Salesforce page will open in your browser. Sign in as you usually do, then click Allow."
   Then run: sf org login web --instance-url https://${host} --alias shoresh
   Wait for it to finish. The Salesforce command line keeps the sign-in; you don't need to read, copy or save anything from it.

4. Test it (the first time can take a minute): npx -y ${PACKAGE} check --org shoresh
   It prints one sentence. Tell me that sentence, in plain words.
   If it says I'm not signed in, do step 3 again once.
   If it says I need a permission set, tell me to ask my Salesforce admin for the "Shoresh Scheduler" permission set.

5. Add Shoresh to the AI app you are running in, as a local MCP server named "shoresh":
   - Claude Code: run: claude mcp add --scope user shoresh -- npx ${args.replace(/[",]/g, "")}
   - Claude's desktop app: in claude_desktop_config.json (Mac: ~/Library/Application Support/Claude/, Windows: %APPDATA%\\Claude\\), under "mcpServers".
   - Cursor: in ~/.cursor/mcp.json, under "mcpServers".
   - Any other app: its own way of adding a local MCP server, with the same command.
   In a settings file, the entry is:
     "shoresh": {"command": "<full path of npx>", "args": [${args}], "env": {"PATH": "<the folders holding node and sf (from: which node sf)>:/usr/bin:/bin"}}
   On Windows instead: "command": "cmd", "args": ["/c", "npx", ${args}] (no "env").
   Keep everything already in the file, and check it is still valid JSON afterwards.
   If this app can't add a local MCP server, tell me: "This AI app can't run Shoresh's connector yet. Claude Code and Cursor can."

6. Finish with one plain sentence: whether Shoresh is connected, and that I should restart this AI app once so Shoresh shows up.`;
}
