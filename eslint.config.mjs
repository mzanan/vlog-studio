import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    files: ["app/**/*.tsx"],
    ignores: ["app/**/_components/ui/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name=/^(button|a)$/] JSXAttribute[name.name='className'] Literal[value=/rounded-full/][value=/bg-white/]",
          message:
            "Inline solid button/anchor styling: reuse the shared primitive instead of hand-written bg-white rounded-full classes.",
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
