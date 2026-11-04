import { LightningElement } from "lwc";
import LICENSE_URL from "@salesforce/resourceUrl/ShoreshLicense";
import { ABOUT, LEGAL } from "./aboutText";

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const NOTE_REF = /([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/;
const toNumber = (sup) =>
  Number([...sup].map((c) => SUPERSCRIPT.indexOf(c)).join(""));

// A paragraph's text as runs: plain text, and each superscript number as a link to its note.
function runs(text, key) {
  return text
    .split(NOTE_REF)
    .filter(Boolean)
    .map((part, i) => {
      if (!NOTE_REF.test(part)) return { key: `${key}-${i}`, text: part };
      const note = toNumber(part);
      return {
        key: `${key}-${i}`,
        note,
        href: `#note-${note}`,
        label: `Note ${note}`
      };
    });
}

/**
 * Reads ABOUT (the draft's own markdown, aboutText.js) into the page: the title, the paragraphs
 * and headings with their footnote numbers, then the notes and the closing line in italics.
 */
export function readAbout(text) {
  const parts = text.trim().split(/\n\s*\n/);
  const about = { title: "", blocks: [], notes: [], credit: [] };
  let inNotes = false;
  parts.forEach((raw, i) => {
    const part = raw.trim();
    const key = `b${i}`;
    if (part.startsWith("# ")) about.title = part.slice(2);
    else if (part === "---") inNotes = true;
    else if (part.startsWith("## "))
      about.blocks.push({ key, heading: true, text: part.slice(3) });
    else if (inNotes && NOTE_REF.test(part[0])) {
      const [, sup, rest] = part.match(/^([⁰¹²³⁴⁵⁶⁷⁸⁹]+)\s*([\s\S]*)$/);
      const note = toNumber(sup);
      about.notes.push({
        key,
        note,
        text: rest,
        label: `Back to note ${note} in the text`
      });
    } else {
      const italic = part.startsWith("*") && part.endsWith("*");
      const body = italic ? part.slice(1, -1) : part;
      const block = {
        key,
        runs: runs(body, key),
        className: italic ? "lede" : "para"
      };
      if (inNotes) about.credit.push({ ...block, className: "credit" });
      else about.blocks.push(block);
    }
  });
  return about;
}

/**
 * Settings' About (Greg's text, footnoted) and Legal (copyright, the licence and its full text,
 * the code, and the open-source parts the app ships). Read only: nothing here saves.
 * The footnote links move the cursor themselves: a "#" link in Lightning would leave the page's
 * own address, and the notes live inside this component.
 */
export default class ShoreshAbout extends LightningElement {
  about = readAbout(ABOUT);
  legal = LEGAL;
  licenseUrl = LICENSE_URL;

  handleNote(event) {
    event.preventDefault();
    this.moveTo(`[data-note="${event.currentTarget.dataset.ref}"]`);
  }

  handleBack(event) {
    event.preventDefault();
    this.moveTo(`[data-ref="${event.currentTarget.dataset.back}"]`);
  }

  moveTo(selector) {
    const target = this.template.querySelector(selector);
    if (target) target.focus();
  }
}
