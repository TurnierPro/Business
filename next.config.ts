import type { NextConfig } from "next";

const config: NextConfig = {
  // Nicht verraten, welche Software läuft
  poweredByHeader: false,
  // Das runde „N“-Werkzeug von Next.js nur für Entwickler: blendet sich sonst unten links über das Menü
  devIndicators: false,
  // Projektordner fest vorgeben (sonst verwirrt eine package-lock.json im Benutzerordner die Erkennung)
  outputFileTracingRoot: __dirname,
  serverExternalPackages: ["@electric-sql/pglite", "playwright-core", "nodemailer", "postgres"],
  experimental: {
    serverActions: { bodySizeLimit: "60mb" },
  },
};

export default config;
