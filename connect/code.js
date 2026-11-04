/**
 * Shoresh for code mode (API-1.18): a script requires this one module and makes many calls at
 * once, e.g. const shoresh = require("./code"); await shoresh.read_group_schedule({...}, { org }).
 * Each action is a plain async function named like its MCP tool and answering exactly what the
 * MCP tool answers ({ ok, status, text }), as the person signed in (API-1.7). ACTIONS is the one
 * description of every action (name, inputs, what it does) that the MCP tool list also comes from.
 * The rules: docs/protocol/api.md, Code mode (API-1.114 to API-1.116). An answer with
 * asksFirst: true did nothing yet: show its text to the person and stop; send confirm only after
 * they said yes to that very text. An AI in a chat runs such a script through the MCP tool
 * run_shoresh_script (script.js, API-1.118 to API-1.122).
 */
const { CAPABILITIES } = require("./capabilities");
const { call, toAgent, withSeasonNamed } = require("./client");

const ACTIONS = CAPABILITIES;

const functions = Object.fromEntries(
  ACTIONS.map(({ name }) => [
    name,
    async (input = {}, { org, run } = {}) =>
      toAgent(withSeasonNamed(await call(name, input, { org, run }), input))
  ])
);

module.exports = { ACTIONS, ...functions };
