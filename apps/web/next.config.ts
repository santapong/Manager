import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@manager/ui"],
  typedRoutes: true,
};

export default config;
