import { LightningElement } from "lwc";
import CONNECTOR from "@salesforce/resourceUrl/ShoreshConnect";
import { connectPrompt, myDomainHost } from "./prompt";

// Seen in Setup, November 2026: Install asks again before it installs; once installed, the row
// offers Manage App Policies instead, the way back to Edit Policies.
export const SIGN_IN_PATHS = [
  [
    "Setup",
    "Connected Apps OAuth Usage",
    "Salesforce CLI",
    "Install",
    "Install"
  ],
  ["Edit Policies", "Refresh Token Policy", "Save"]
];

/**
 * Settings' "Connect your AI" (API-1.15 to API-1.17): Claude desktop downloads the extension from
 * this camp's own Salesforce; any AI app that runs commands (Claude Code, Cursor and the like)
 * takes the prompt the person copies and pastes into it.
 * If copying isn't allowed, the prompt is shown to copy by hand.
 */
export default class ShoreshConnectAi extends LightningElement {
  copied = false;
  downloaded = false;
  copyFailed = false;

  get host() {
    return myDomainHost(window.location.hostname);
  }

  get prompt() {
    return this.host ? connectPrompt(this.host) : "";
  }

  extensionUrl = CONNECTOR;

  // How long a person's AI stays signed in is the camp's call (API-1.162, Greg 2026-11-28): the
  // Salesforce CLI app's Refresh Token Policy, which the connector's sign-in follows. Salesforce's
  // own words; the app is listed there once someone has signed in with an AI.
  signInPaths = SIGN_IN_PATHS.map((clicks, p) => ({
    key: `path-${p}`,
    clicks: clicks.map((label, i) => ({
      key: `click-${i}`,
      label,
      after: i > 0
    }))
  }));

  get copyLabel() {
    return this.copied ? "Copied" : "Copy prompt for your AI";
  }

  get copyIcon() {
    return this.copied ? "utility:check" : "utility:copy";
  }

  get said() {
    if (this.downloaded) return "Downloaded. Open Shoresh.mcpb.";
    if (this.copied) return "Copied. Paste it into your AI app.";
    return this.copyFailed ? "Couldn't copy. The prompt is below." : "";
  }

  handleDownload() {
    this.downloaded = true;
    this.copied = false;
  }

  async handleCopy() {
    this.downloaded = false;
    try {
      await navigator.clipboard.writeText(this.prompt);
      this.copied = true;
      this.copyFailed = false;
    } catch {
      this.copied = false;
      this.copyFailed = true;
    }
  }
}
