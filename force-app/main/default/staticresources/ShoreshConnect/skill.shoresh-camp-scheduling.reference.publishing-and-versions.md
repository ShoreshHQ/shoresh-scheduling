# Publishing, downloads, versions and Undo

## Publishing

- Publishing marks one version of a program's week final; each program publishes on its own
  (PUB-1.1). It changes nothing in the schedule (PUB-4.1).
- Before publishing, read the checks (`read_week_checks`) and tell the person what is still Open,
  short or over, in the checks' words. Publish (`publish_week`) only when they ask.
- A published week changes only through Publish again, Unpublish (`unpublish_week`) or rename
  (PUB-4.3).
- Reading what campers and staff see: `read_group_schedule`, `read_activity_schedule`, the
  published week only, with a link to the screen; give the person that link (API-1.28).
- Files: `download_schedule` (the week, a day, a group, an activity, a location, a division or a
  staff member, as Excel or a printout), `download_special_schedule`. They save in the person's
  Downloads folder.
- Sends to other systems that failed: `read_failed_sends` (read only; the camp's own Salesforce
  sends again).

## Versions

Shoresh keeps a version only where the screen does: Rebuild, Try another, bringing an option
back, Start over, Restore and rain plans each keep one (API-1.12), and so do Clear day and Clear
week (WEEK-6.14); a cell edit keeps none. A first Generate and Fill the open
cells keep none, and Update to match setup keeps one only when it replaces hand work. Never tell
the person "you can go back" unless a version exists: check with `list_versions` first.

- `list_versions` to find a version by its name; never guess one.
- `restore_version` keeps the week as it is now first ("Before Restore").
- `save_version`, `rename_version` when asked. `delete_version` is for good and asks first;
  published versions are kept (PUB-6.1).

## Undo

- `undo_last_change` takes back the last change made **in this conversation**, one step at a time,
  as the screen's Undo does (API-1.14). It is gone in a new conversation, or if the AI app
  restarted the connector.
- Some actions have no Undo, as on the screen: Generate, Try another, bringing back an option,
  Fill the open cells, Set it up, Update to match setup. Where a version was kept, the answer
  names it; Fill the open cells and a first Generate keep none.
- Anything from an earlier conversation: `restore_version`.
- Imports and learned answers have their own: `undo_import`, `undo_learned_answer`.

Undo only what the person asked to undo. If the last change in the week isn't theirs, say so
before undoing anything.
