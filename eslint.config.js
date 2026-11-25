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

  // Elective seats follows a large camp's save in the background (repo ADR 0018 choice 59): one
  // pause between reads. One file, one rule; the same in code-analyzer.yml.
  {
    files: ["**/lwc/shoreshElectiveSeats/shoreshElectiveSeats.js"],
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

  // The AI connector (connect/, shipped as the ShoreshConnect static resource and run on the
  // director's own computer) and the repository's scripts: Node code, so Node's rules.
  {
    files: ["connect/**/*.js", "scripts/**/*.js"],
    ignores: ["connect/view/**"],
    languageOptions: {
      sourceType: "commonjs",
      ecmaVersion: "latest",
      globals: { ...globals.node }
    },
    plugins: { eslintJs },
    extends: ["eslintJs/recommended"],
    rules: {
      // `const { confirm, ...rest } = x` is how the connector leaves a field out of a copy.
      "no-unused-vars": ["error", { ignoreRestSiblings: true }]
    }
  },
  {
    files: ["scripts/**/*.mjs", "scripts/import-corpus/**/*.js"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: "latest",
      globals: { ...globals.node }
    },
    plugins: { eslintJs },
    extends: ["eslintJs/recommended"]
  },
  // The connector's two browser pages' entries (built into its .html files by build-connect.js).
  {
    files: ["connect/view/*.js"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: "latest",
      globals: { ...globals.browser }
    },
    plugins: { eslintJs },
    extends: ["eslintJs/recommended"]
  },
  // The shipped connector runs programs on the director's computer: always a program and its
  // arguments as a list (execFile), never a command line a shell reads, and never text run as code
  // outside script.js's walled-off worker (API-1.119).
  {
    files: ["connect/*.js"],
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "VariableDeclarator[init.callee.name='require'][init.arguments.0.value='child_process'] Property[key.name=/^(exec|execSync|spawn|spawnSync)$/]",
          message:
            "Run a program with execFile and its arguments as a list, so no shell reads them."
        },
        {
          selector: "Property[key.name='shell'][value.value=true]",
          message:
            "No shell: run the program with execFile and its arguments as a list."
        }
      ]
    }
  },
  // Browser checks hand functions to Playwright, which runs them inside the page; and the focus
  // check's own test runs that function in Jest's browser stand-in (jsdom).
  {
    files: [
      "scripts/a11y-browser-check.mjs",
      "scripts/engine-browser-timing.mjs",
      "scripts/break-rebuild/screens.mjs",
      "scripts/__tests__/a11y-browser-check-lib.test.js"
    ],
    languageOptions: { globals: { ...globals.browser } }
  },
  // The connector's tests and the scripts' tests run in Jest.
  {
    files: ["connect/__tests__/**/*.js", "scripts/__tests__/**/*.js"],
    languageOptions: {
      globals: { ...globals.node, ...jestPlugin.environments.globals.globals }
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
