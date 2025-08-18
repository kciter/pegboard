// @ts-check
import { configs } from '@pegboard/eslint-config';

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...configs,
  {
    linterOptions: { reportUnusedDisableDirectives: false },
  },
];
