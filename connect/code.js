/**
 * Shoresh for code mode (API-1.18): a script requires this one module and makes many calls at
 * once, e.g. const shoresh = require("./code"); await shoresh.read_group_schedule({...}, { org }).
 * Each action is a plain async function named like its MCP tool and answering exactly what the
 * MCP tool answers ({ ok, status, text }), as the person signed in (API-1.7). ACTIONS is the one
 * description of every action (name, inputs, what it does) that the MCP tool list also comes from.
 */
const { CAPABILITIES } = require("./capabilities");
const { call } = require("./client");

const ACTIONS = CAPABILITIES;

const functions = Object.fromEntries(
  ACTIONS.map(({ name }) => [
    name,
    (input = {}, { org, run } = {}) => call(name, input, { org, run })
  ])
);

module.exports = { ACTIONS, ...functions };
