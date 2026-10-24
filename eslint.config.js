const { defineConfig } = require("eslint/config");
const eslintJs = require("@eslint/js");
const jestPlugin = require("eslint-plugin-jest");
const auraConfig = require("@salesforce/eslint-plugin-aura");
const lwcConfig = require("@salesforce/eslint-config-lwc/recommended");
const globals = require("globals");

module.exports = defineConfig([
  // Aura configuration
  {
    files: ["**/aura/**/*.js"],
    extends: [...auraConfig.configs.recommended, ...auraConfig.configs.locker]
  },

  // LWC configuration
  {
    files: ["**/lwc/**/*.js"],
    extends: [lwcConfig]
  },

  // The living dot field draws its frames with requestAnimationFrame, the browser's own clock
  // for animation (ADR 0015 choice 13). One file, one rule; the same in code-analyzer.yml.
  {
    files: ["**/lwc/shoreshDotField/shoreshDotField.js"],
    rules: {
      "@lwc/lwc/no-async-operation": "off"
    }
  },

  // Shoresh's one model of motion (Roots' table, ADR 0020) draws its frames, and counts its short
  // waits, with requestAnimationFrame. One file, one rule; the same in code-analyzer.yml.
  {
    files: ["**/lwc/shoreshMotion/shoreshMotion.js"],
    rules: {
      "@lwc/lwc/no-async-operation": "off"
    }
  },

  // LWC configuration with override for LWC test files
  {
    files: ["**/lwc/**/*.test.js"],
    extends: [lwcConfig],
    rules: {
      "@lwc/lwc/no-unexpected-wire-adapter-usages": "off"
    },
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },

  // Jest mocks configuration
  {
    files: ["**/jest-mocks/**/*.js"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: "latest",
      globals: {
        ...globals.node,
        ...globals.es2021,
        ...jestPlugin.environments.globals.globals
      }
    },
    plugins: {
      eslintJs
    },
    extends: ["eslintJs/recommended"]
  }
]);
