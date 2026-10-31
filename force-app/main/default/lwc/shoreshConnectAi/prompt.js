/**
 * The prompt the "Connect your AI" card copies (API-1.15, API-1.16): written for the AI, which
 * does the whole setup; the person only signs in in their browser. It names this camp's
 * Salesforce by its My Domain host and nothing else: never a sign-in link, code or token.
 */

// The connector is the package's ShoreshConnect static resource (API-1.15): the AI downloads it
// from the camp's own Salesforce with the person's own sign-in. Nothing comes from GitHub.
const API = "/services/data/v66.0";

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
  const server = "<your home folder>/.shoresh/connect/server/shoresh.js";
  return `Please connect me to Shoresh, my camp's scheduling app in Salesforce, so you can read and change our camp's schedules for me. Please do the setup yourself by running the commands below on this computer. I will only click in my web browser when Salesforce asks me to sign in.

My camp's Salesforce: ${host}

If you can't run commands on this computer, stop and tell me: "I can't set this up from here. In Shoresh's Settings, use the Claude desktop button instead, or paste the same message into Claude Code or Cursor."
Never use sudo or ask for my computer's password; if a step needs that, use the message for that step instead.

1. Run: node --version
   If Node.js is missing or older than version 20, stop and tell me: "Your computer needs Node.js first. Install the LTS version from https://nodejs.org, then paste the same message to me again."

2. Run: sf --version
   If the Salesforce command line is missing, install it: npm install --global @salesforce/cli
   If that fails, stop and tell me: "Your computer needs the Salesforce command line. Install it from https://developer.salesforce.com/tools/salesforcecli, then paste the same message to me again."

3. Tell me: "A Salesforce page will open in your browser. Sign in as you usually do, then click Allow."
   Then run: sf org login web --instance-url https://${host} --alias shoresh
   Wait for it to finish. The Salesforce command line keeps the sign-in; you don't need to read, copy or save anything from it.

4. Get Shoresh's connector from my camp's Salesforce:
   Run: sf data query --target-org shoresh --json --query "SELECT Id FROM StaticResource WHERE Name = 'ShoreshConnect'"
   If it finds nothing, stop and tell me: "Your camp's Salesforce doesn't have Shoresh's connector yet. Ask your Salesforce admin to update Shoresh."
   Then run: sf api request rest ${API}/sobjects/StaticResource/<that Id>/Body --target-org shoresh --stream-to-file <your home folder>/.shoresh/connect.zip
   Unzip it into <your home folder>/.shoresh/connect, replacing what is there (Mac: unzip -o; Windows: tar -xf).

5. Test it: node ${server} check --org shoresh
   It prints one sentence. Tell me that sentence, in plain words.
   If it says I'm not signed in, do step 3 again once.
   If it says I need a permission set, tell me to ask my Salesforce admin for the "Shoresh Scheduler" permission set.

6. Add Shoresh to the AI app you are running in, as a local MCP server named "shoresh" whose command is node (its full path, from "which node", or "where node" on Windows) with the arguments: ${server} --org shoresh
   - Claude Code: run: claude mcp add --scope user shoresh -- node ${server} --org shoresh
   - Cursor: in ~/.cursor/mcp.json, under "mcpServers": "shoresh": {"command": "<full path of node>", "args": ["${server}", "--org", "shoresh"]}
   - Any other app: its own way of adding a local MCP server.
   Write <your home folder> out in full. Keep everything already in a settings file, and check it is still valid JSON afterwards.
   If this app can't add a local MCP server, tell me: "This AI app can't run Shoresh's connector yet. Claude Code and Cursor can, and Claude's desktop app can with the Claude desktop button in Shoresh's Settings."

7. Finish with one plain sentence: whether Shoresh is connected, and that I should restart this AI app once so Shoresh shows up.`;
}
