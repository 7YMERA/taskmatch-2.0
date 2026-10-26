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
  ]),
  {
    // Rule tuning so `npm run lint` can be a BLOCKING CI gate without a large refactor.
    //
    // These are downgraded to warnings (still reported, tracked in docs/ROADMAP.md as
    // debt, but not failing the build):
    //   - no-explicit-any: ~150 `any`s on untyped Supabase row data. Style debt, not bugs.
    //   - the React Compiler (react-hooks/*) rules below fire on standard, working data-
    //     loading patterns (setState inside a load effect, a missing effect dep). Adopting
    //     them fully is its own refactor; kept visible as warnings until then.
    //
    // Everything NOT listed here — TypeScript type errors, syntax errors, real purity
    // bugs (impure calls in render, which we fixed with useMemo) — stays an ERROR and
    // blocks the build.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
]);

export default eslintConfig;
