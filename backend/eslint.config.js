import js from "@eslint/js";
import globals from "globals";

// Backend lint: ESLint's recommended correctness rules (no style opinions —
// the codebase has no formatter config). Catches real bugs such as undefined
// variables, unreachable code and duplicate keys.
export default [
  { ignores: ["node_modules/**", "ocr-data/**", "prisma/migrations/**", "uploads/**", ".test-build/**"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.node } },
    rules: {
      // Intentionally unused (underscore-prefixed) bindings are allowed, e.g.
      // `const { access_token_hash: _tokenHash, ...rest } = row`.
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true }],
    },
  },
];
