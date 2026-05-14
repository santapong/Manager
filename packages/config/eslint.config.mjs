import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/.turbo/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@vercel/blob",
              message:
                "Import via @manager/storage. Direct vendor imports are forbidden outside the adapter file (see PLAN.md §7).",
            },
            {
              name: "ably",
              message:
                "Import via @manager/realtime. Direct vendor imports are forbidden outside the adapter file (see PLAN.md §7).",
            },
            {
              name: "pusher",
              message: "Import via @manager/realtime (see PLAN.md §7).",
            },
            {
              name: "resend",
              message: "Import via @manager/email (see PLAN.md §7).",
            },
          ],
        },
      ],
    },
  },
);
