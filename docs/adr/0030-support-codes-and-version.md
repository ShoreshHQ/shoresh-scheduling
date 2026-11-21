# 0030. A support code on every problem Shoresh can't explain, and the version under Help

Date: 2026-11-21. Status: accepted (Greg, 2026-11-21, on a director-reviewer's three gaps: "fix all
three"; "leave the about page for now").

## Context

When something went wrong that Shoresh couldn't put in its own words, the screen said "Try again."
and the detail went to the browser console or the Apex debug log. A director asking for help had
nothing to read out, and support had nothing to look up: a console is on the director's computer,
and a debug log is kept only while someone is tracing. Settings' Help gave support's address but
not which Shoresh the camp has. The desktop shows its version beside About & Legal
(`src/components/layout/Sidebar.jsx`, "About & Legal · v…") and has no error codes; it never left
the director's computer, so support saw what the director saw.

## Choices

1. **The code (CORE-6.15).** Six letters and digits in two threes, "K7Q-4MX", from 25 that can't
   be read or heard as another (no 0/O, 1/I/L, 2/Z, 5/S, 8/B). It follows the why: _Swim wasn't
   saved. Try again. For support: K7Q-4MX._ It is plain text in the message, so it can be read out
   or selected and copied, and every screen that shows an error shows it with no change of its own.
   Only problems Shoresh can't explain get one, and "too big for Salesforce" (the limit message):
   Shoresh's own refusals are a reason the person acts on, and carry none. One request has one
   code: a save refused on many rows is one problem.
2. **Where the detail is kept: an Error Log record in the camp's own org.** No outside service,
   and nothing leaves the org. The record's name is the code; it holds who it happened to
   (`Person__c`), the detail (kind, message, where in Shoresh) and, as its Created date, when.
   No permission set grants it, so only an admin, or Shoresh support logged in as one
   (subscriber support login), reads it: Setup's Developer Console or any SOQL tool,
   `SELECT Name, CreatedDate, Person__r.Name, Detail__c FROM ErrorLog__c WHERE Name = 'K7Q-4MX'`
   (with the package's namespace prefix once it has one). Global search also finds it by code. The detail is
   the platform's own message and stack, which can rarely quote a typed value (a name), as the debug
   log always did; it stays in the camp's org and is not cleared on its own.
3. **Kept even when the request is undone.** A refused save undoes everything its request wrote,
   so a record written there would vanish with it. The detail goes out on a platform event
   published immediately (`ErrorLogEvent__e`), which an undo doesn't take back; its trigger, run by
   Salesforce's Automated Process user, writes the record in system mode (reviewer notes, system
   mode row 3: Shoresh's own logs).
4. **Problems the server never saw.** Salesforce's limits, a dropped connection or a script error
   reach only the screen. `c/shoreshErrors` makes the code there, shows it at once, and asks
   `ErrorCodes.keepFromScreen` to keep it with what the screen knows; if that can't reach
   Salesforce the code still shows and the detail is in the console. A code the server already
   put in its message is shown as it came, never given a second. Anyone with Shoresh Scheduler can call
   `keepFromScreen`, so a record can be added by a person, never read, changed or deleted; it
   always names who sent it, and a code already kept is not kept again. The connector for AI apps carries
   the same module (scripts/build-connect.js); a problem only its own computer met is said with a
   code but kept only in that computer's log, since it has no screen in Salesforce to keep it
   through. Problems Salesforce met reach it with the server's code, kept as usual.
5. **The version (CORE-6.16).** Help in Settings shows "Version 1.4" beside support's address,
   quiet text, as the desktop's version sits beside About. It is Salesforce's own answer for the
   installed package (`System.requestVersion()`, major and minor; Salesforce gives no patch
   number). Outside an installed package (the test org) there is none, and nothing is shown.
   Salesforce stops a request that asks there with an error no catch can stop, so Shoresh first
   checks it is installed (`UserInfo.isCurrentUserLicensed` on its namespace, which refuses a
   namespace no package installed) and asks only then.
   The About page is unchanged.
