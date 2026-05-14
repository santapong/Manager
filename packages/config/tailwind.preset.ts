import type { Config } from "tailwindcss";

const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f6ff",
          500: "#5b6cff",
          600: "#4a5af0",
          700: "#3d4ad0",
        },
      },
    },
  },
};

export default preset;
