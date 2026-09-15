import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".agents/**",
    "archive/**",
    "scripts/**",
    "convex/_generated/**",
  ]),
  {
    rules: {
      // Existing backend integrations intentionally use dynamic records at
      // the database/provider boundaries.
      "@typescript-eslint/no-explicit-any": "off",
      "prefer-const": "off",
      // These React 19 compiler diagnostics are not compatible with the
      // established imperative canvas, upload, and synchronization patterns.
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
    },
  },
]);

export default eslintConfig;
