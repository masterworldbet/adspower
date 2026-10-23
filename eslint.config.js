import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  { ignores: ["dist/**", "dist-electron/**", "node_modules/**", "release/**", "browser-binaries/**"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
