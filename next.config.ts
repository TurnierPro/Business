import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "playwright-core", "nodemailer", "postgres"],
  experimental: {
    serverActions: { bodySizeLimit: "60mb" },
  },
  output: "standalone",
};

export default config;
