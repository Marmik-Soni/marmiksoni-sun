import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  // Global ignores
  { ignores: ["dist/", "node_modules/", "coverage/"] },

  // Base JS recommended
  js.configs.recommended,

  // TS recommended (type-aware)
  ...tseslint.configs.recommendedTypeChecked,

  // TS project config
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Custom rules
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // Prettier last — disables conflicting formatting rules
  eslintConfigPrettier,
);
