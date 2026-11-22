import { LightningElement, api } from "lwc";
import SAMPLE from "@salesforce/resourceUrl/ShoreshSampleCamp";
import { buildTerms } from "c/shoreshTerms";
import {
  guideSteps,
  SAMPLE_CAMP_FILE,
  SAMPLE_CHOICES_FILE,
  SAMPLE_ELECTIVES_FILE
} from "./guideSteps";

/**
 * Settings' Getting started (CORE-6.17), beside About: a closed row until opened, then the first
 * steps as numbered cards, each the exact things to click drawn as buttons in a row, and the
 * made-up sample camp to download (the ShoreshSampleCamp static resource). Read only: nothing
 * here saves. terms: the camp's words (c/shoreshTerms).
 */
export default class ShoreshGuide extends LightningElement {
  @api terms;
  open = false;
  campUrl = `${SAMPLE}/sample-camp.xlsx`;
  electivesUrl = `${SAMPLE}/sample-electives.csv`;
  choicesUrl = `${SAMPLE}/sample-choices.csv`;
  campFile = SAMPLE_CAMP_FILE;
  electivesFile = SAMPLE_ELECTIVES_FILE;
  choicesFile = SAMPLE_CHOICES_FILE;

  get t() {
    return this.terms && typeof this.terms.s === "function"
      ? this.terms
      : buildTerms([]);
  }

  get expanded() {
    return this.open ? "true" : "false";
  }

  get chevronClass() {
    return this.open ? "chevron chevron_open" : "chevron";
  }

  get steps() {
    return guideSteps(this.t).map((step, index) => ({
      ...step,
      number: index + 1,
      paths: step.paths.map((clicks, row) => ({
        key: `${step.key}-${row}`,
        clicks: clicks.map((label, at) => ({
          key: `${step.key}-${row}-${at}`,
          label,
          // An arrow before every click but the first: the order to click them in.
          after: at > 0
        }))
      }))
    }));
  }

  handleToggle() {
    this.open = !this.open;
  }
}
