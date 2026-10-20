import type { NextConfig } from "next";

const config: NextConfig = {
  // Nicht verraten, welche Software läuft
  poweredByHeader: false,
  serverExternalPackages: ["@electric-sql/pglite", "playwright-core", "nodemailer", "postgres"],
  experimental: {
    serverActions: { bodySizeLimit: "60mb" },
  },
};

export default config;
