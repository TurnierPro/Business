# Levarex OS (Docker), Betrieb bei Hostinger
FROM node:22-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production DATA_DIR=/data

# PostgreSQL-Werkzeuge für Sicherung und Wiederherstellung (pg_dump, pg_restore), tar für die Dateien
# Client-Version muss zur Datenbank passen (postgres:17); Debian selbst liefert nur Version 15
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update && apt-get install -y --no-install-recommends postgresql-client-17 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci
# Chromium für die PDF-Erzeugung
RUN npx playwright-core install --with-deps chromium

COPY . .
RUN npm run build

VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=10s CMD node -e "fetch('http://localhost:3000/api/gesundheit').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
