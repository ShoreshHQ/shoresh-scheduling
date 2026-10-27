# The Shoresh protocol

Shoresh behaves by a layered protocol, like DNS, IP and HTTP: defined terms and an order of
actions, not rules that bend (Greg, 2026-10-27). One **CORE** protocol covers the whole
software. Each **sub-protocol** inherits CORE and works only on its own job.

## The layers

Bottom to top:

1. **Terms**: one meaning per word.
2. **Reading**: input becomes facts.
3. **Classification**: fixed activity, then recurring activity, then activity.
4. **Limits**: what never bends.
5. **Placement order**: what goes down first.
6. **Explanation and measures**: what is shown and counted.

**The layer rule:** a layer uses only the layers below it and never overrides them. A
sub-protocol adds statements on top of CORE; it never contradicts a CORE statement.

## The tree

```
CORE  layers 1-6                                 docs/protocol/core.md
 |- INGEST  Import last year, re-import          uses CORE 1-3, 6   docs/import/classification.md, docs/import/names-and-divisions.md
 |- GEN     Building a week                      uses CORE 1-6      docs/engine/protocol.md
 |   |- ELECT    Electives                       sits on GEN's week (its sets are kept cells)
 |   |- SPECIAL  Special events and special days sits on GEN's week (a special day is its own day)
 |   '- CLOSE    Closures and away groups        feeds GEN layer 4
 |- DIV     Divisions                            uses CORE 1, 3, 4
 |- PROG    Programs                             uses CORE 1, 4
 |- WEEK    Weeks and seasons                    uses CORE 1, 2
 |- LOCK    Locks and hand edits                 uses CORE 1, 4, 6; GEN obeys it
 |- MEMO    Remembered answers                   uses CORE 1, 6; serves INGEST
 '- PUB     Publishing                           uses CORE 1, 6; reads any finished week
```

ELECT, SPECIAL, CLOSE, DIV, PROG, WEEK, LOCK, MEMO and PUB are sketched in the wiki
(`projects/shoresh-protocol.md`, section D) and are not yet written here.

## Statements and their numbers

A statement is one MUST, MUST NOT or MAY, in camp words, with an ID `PROTOCOL-layer.n`:
`CORE-4.2` is CORE's layer 4, second statement. CORE's terms are layer 1 (`CORE-1.13`, fixed
activity).

The existing sub-protocol documents keep their own numbers, read with a prefix:

| Document                             | Its numbers       | Statement ID |
| ------------------------------------ | ----------------- | ------------ |
| `docs/protocol/core.md`              | CORE-layer.n      | as written   |
| `docs/engine/protocol.md`            | rule n.m, by step | `GEN-n.m`    |
| `docs/import/classification.md`      | rules 1-8         | `INGEST-3.n` |
| `docs/import/names-and-divisions.md` | rules 1-5         | `INGEST-2.n` |

GEN's rule numbers follow the engine's nine build steps, not CORE's layers: `GEN-5.1` is build
step 5's first rule. The wiki's sketch numbers for GEN and INGEST will be renumbered to these.

## How a statement is tested

A test proves a statement by naming its ID, in the test's title or in a comment beside it:

```js
// CORE-4.2
it("never repeats an activity in a day: the cell stays Open, saying so", () => {
```

`node scripts/protocol-index.js` reads every statement ID from the documents above and searches
every test file for it. Each statement is one of:

- **ENCODED**: at least one test names the ID.
- **MAPPED**: the sub-protocol's own table names a test for it, but no test names the ID yet.
- **NOT YET TESTED**: neither.

`scripts/__tests__/protocol-index.test.js` pins the number of ENCODED statements as a floor: it
may only go up. When a change adds citations, raise the floor in that test.
