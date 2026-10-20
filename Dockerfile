# Nexova OS für Coolify auf Hetzner
FROM node:22-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production DATA_DIR=/data

# PostgreSQL-Werkzeuge für Backups, rsync/ssh für die Storage Box
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client rsync openssh-client ca-certificates && rm -rf /var/lib/apt/lists/*

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
