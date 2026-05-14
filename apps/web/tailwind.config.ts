import type { Config } from "tailwindcss";
import preset from "@manager/config/tailwind-preset";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  presets: [preset as Config],
};

export default config;
