import type { NextConfig } from "next";
const config: NextConfig = {
  output: "export",
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: { root: process.cwd() },
};
export default config;
