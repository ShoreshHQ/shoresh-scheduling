/**
 * The prompt the "Connect your AI" card copies (API-1.15, API-1.16): written for the AI, which
 * does the whole setup; the person only signs in in their browser. It names this camp's
 * Salesforce by its My Domain host and nothing else: never a sign-in link, code or token.
 */

const PACKAGE = "github:ShoreshHQ/shoresh-scheduling";

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
  const run = `npx -y ${PACKAGE} --org shoresh`;
  return `Please connect me to Shoresh, my camp's scheduling app in Salesforce, so you can read and change our camp's schedules for me. Please do the setup yourself by running the commands below on this computer. I will only click in my web browser when Salesforce asks me to sign in.

My camp's Salesforce: ${host}

If you can't run commands on this computer, stop and tell me: "I can't set this up from here. Paste the same message into Claude Code, Claude's desktop app with Claude Code, or Cursor."

1. Run: node --version
   If Node.js is missing or older than version 20, stop and tell me: "Your computer needs Node.js first. Install the LTS version from https://nodejs.org, then paste the same message to me again."

2. Run: sf --version
   If the Salesforce command line is missing, install it: npm install --global @salesforce/cli
   If that fails, stop and tell me: "Your computer needs the Salesforce command line. Install it from https://developer.salesforce.com/tools/salesforcecli, then paste the same message to me again."

3. Tell me: "A Salesforce page will open in your browser. Sign in as you usually do, then click Allow."
   Then run: sf org login web --instance-url https://${host} --alias shoresh
   Wait for it to finish. The Salesforce command line keeps the sign-in itself; never show me, copy or save a sign-in code or token.

4. Add Shoresh to the AI app you are running in, as a local MCP server named "shoresh" whose command is: ${run}
   - Claude Code: run: claude mcp add --scope user shoresh -- ${run}
   - Claude's desktop app: add it under "mcpServers" in claude_desktop_config.json (Mac: ~/Library/Application Support/Claude/, Windows: %APPDATA%\\Claude\\).
   - Cursor: add it under "mcpServers" in ~/.cursor/mcp.json.
   - Any other app: its own way of adding a local MCP server.
   When you edit a settings file, keep everything already in it. Use the full path of npx (from "which npx", or "where npx" on Windows), and give the server "env": {"PATH": "<this computer's PATH>"} so the app can find npx and sf. On Windows the command is "cmd" with "/c" before npx.
   If this app can't add a local MCP server, tell me: "This AI app can't run Shoresh's connector yet. Claude Code, Claude's desktop app and Cursor can."

5. Test it: run: npx -y ${PACKAGE} check --org shoresh
   It prints one sentence. Tell me that sentence, in plain words.
   If it says I need a permission set, tell me its name and that my Salesforce admin can give it to me. If I am the admin, offer to add it, and only if I say yes: find its name with "sf org list metadata --metadata-type PermissionSet --target-org shoresh", then run "sf org assign permset --name <that name> --target-org shoresh".
   If it says I'm not signed in, go back to step 3 once.

6. Finish with one plain sentence: whether Shoresh is connected, and whether I need to restart this AI app once to see it.`;
}
