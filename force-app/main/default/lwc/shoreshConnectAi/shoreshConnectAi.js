import { LightningElement } from "lwc";
import CONNECTOR from "@salesforce/resourceUrl/ShoreshConnect";
import { connectPrompt, myDomainHost } from "./prompt";

/**
 * Settings' "Connect your AI" (API-1.15 to API-1.17): Claude desktop downloads the extension from
 * this camp's own Salesforce; Claude Code or Cursor copies the prompt the person pastes into it.
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

  get copyLabel() {
    return this.copied ? "Copied" : "Claude Code or Cursor";
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
