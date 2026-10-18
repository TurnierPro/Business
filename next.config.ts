import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "playwright-core", "nodemailer", "postgres"],
  experimental: {
    serverActions: { bodySizeLimit: "60mb" },
  },
};

export default config;
