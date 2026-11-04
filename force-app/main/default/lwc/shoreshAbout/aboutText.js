// The words of Settings' About and Legal, kept here alone so a change of wording is an edit of
// this one file. ABOUT is Greg's About text as written (2026-11-04), in the draft's own markdown:
// "# " the title, "## " a heading, a paragraph wholly in *asterisks* in italics, a superscript
// number a footnote, and after "---" the footnotes themselves (each starting with its number).
// shoreshAbout.js reads it into the page; nothing else is markdown.

export const ABOUT = `
# About Shoresh

*An About page, which is a page nobody has ever opened on purpose, written at a length that suggests someone expected you to.¹*

Here's the job. You've got kids. You've got places. You've got hours. You put the kids in the places during the hours. That's it. That's the whole thing. People did a version of it on a cave wall with a stick and a firm hand.

And yet.

Somewhere between the cave wall and now, the industry that sells you the stick worked out that it could rent you the stick. Monthly. Per user. With an onboarding call, a customer success manager named something like Brayden, a pricing page whose last column just says "Let's talk," and an integration marketplace so your stick can talk to your other sticks, each of which also bills monthly, and none of which, when you really get down to it, can tell you whether the gym is free at 10:30.²

Platforms. Ecosystems. Solutions. Seamless end-to-end workflows. That's a lot of words. That's a lot of words for "is the gym free." Big words. Brayden words.

The gym is free at 10:30, by the way. Shoresh checked.

## What it is

Shoresh makes the week: bunks, activities, places, times. It builds a schedule that follows your camp's rules. It shows you every problem it couldn't solve instead of quietly pretending it did.³ It never touches a cell you locked, because you're the director and it's a computer, and the computer works for you. That arrangement is worth restating every so often in this industry.

Same setup, same week. Every time. It doesn't get creative on you on a Tuesday.

## Where it lives

Inside your camp's own Salesforce. Your schedule stays in your org. We don't have a server with your campers on it. We don't have a server, period, which is either a bold architectural philosophy or a budget, and the honest answer is a pleasing amount of both.

Yes, we know. An app that pokes fun at enterprise software, living inside the most enterprise software there is. It's a hot dog stand inside a Costco, and yes, Costco already has one. But your data was already there, the roof doesn't leak and someone else handles the plumbing. Anyone who has run a camp knows "someone else handles the plumbing" is the most underrated sentence in the English language.⁴

## What it costs

Nothing. Free. It's free the way a sunset is free, or the way advice from a counselor's uncle is free, except this one is worth something.

The code is open source (Apache 2.0) and on GitHub. Read it, change it, take it home. If you make it better, share it, so the next camp gets it too. Camps work that way anyway. Nobody invented color war alone.

## Who made it

A camp director. Not a programmer. Someone who has explained to a swim instructor why seventeen kids showed up at the pool at once, despite a schedule everybody approved, and who was told, roughly, that software would fix this, and was then shown the invoice.

So the director built it, with an AI doing the typing. For most of history, knowing a problem cold and being able to build software for it were two different people in two different buildings, having a meeting about a third thing. That's changing. The people who know the work can now make the tools for the work.⁵ Teachers. Nurses. Mechanics. Camp directors. Somebody's grandmother, who will make a better one than all of us.

Your own AI can use Shoresh too. It can do everything you can do on the screens, and before it deletes, merges or finalizes anything, it asks you first. Same as a good unit head.

## Anyway

The schedule still needs making. The kids still need to get to swim. The counselors still need lunch. And someone is going to ask whether Bunk 7 can swap archery with basketball on Thursday.

They can.

That's the point.

Now go make a schedule.

---

¹ The rest of Shoresh tries never to explain itself in words, on the principle that a screen that needs a paragraph is a screen that didn't do its job. This page is the paragraph. It's kept over here, where it can't hurt anybody.

² Brayden is a composite. Brayden is doing his best. Brayden also has a quota.

³ Showing you the problem turns out to be a feature. Plenty of software handles a conflict by resolving it quietly and hoping. Shoresh puts a little mark on it and looks at you, like a camper who found a frog.

⁴ Second most underrated: "The bus is here."

⁵ This is, broadly, good news. It may be less good news for companies whose business is renting the stick. To be fair to them, they've shown real creativity in answering news like this, mostly by adding a pricing tier.

*Written by Claude. The jokes' raw material, the swim instructor and twenty years of actually running the thing came from the camp director who built Shoresh. Claude would like it noted that it was asked for an About page, produced footnotes, and considers this within the spirit of the assignment.*
`;

export const LEGAL = {
  title: "Legal",
  copyright: "Copyright 2026 Gregory Feitel, doing business as Shoresh",
  licence: "Licensed under the Apache License 2.0.",
  licenceText: "Full licence text",
  code: "The code on GitHub",
  codeUrl: "https://github.com/ShoreshHQ/shoresh-scheduling",
  partsTitle: "Open-source parts Shoresh includes",
  // From the repo's NOTICE: what the packaged app ships (not the development-only skills).
  parts: [
    "Shoresh desktop, by Gregory Feitel and contributors (Apache 2.0)",
    "SheetJS Community Edition 0.20.3, by SheetJS (Apache 2.0)",
    "The Inter and JetBrains Mono typefaces (SIL Open Font License 1.1)"
  ]
};
