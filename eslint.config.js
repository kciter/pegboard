// @ts-check
import * as react from "@chance/eslint/react";
import * as js from "@chance/eslint";
import * as typescript from "@chance/eslint/typescript";
import { globals } from "@chance/eslint/globals";
import pluginCypress from "eslint-plugin-cypress/flat";

/** @type {import("eslint").Linter.Config[]} */
export default [
  { ...js.getConfig({ ...globals.node, ...globals.browser }) },
  typescript.config,
  {
    ignores: ["dist/**", ".next/**"],
    rules: {
      "prefer-const": ["warn", { destructuring: "all" }],
    },
  },
];
