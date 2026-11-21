#!/usr/bin/env bash
# Einmalige Grundeinrichtung eines frischen Hostinger-VPS (Ubuntu 24.04) für Levarex OS.
# Ausführen als root, NACHDEM der eigene SSH-Schlüssel im Hostinger-Panel hinterlegt ist und die Anmeldung damit klappt.
# Was es tut: Updates, Firewall (nur SSH, 80, 443), Anmeldung nur per SSH-Schlüssel, automatische Sicherheits-Updates,
# Docker, Ordner /opt/levarex. Es löscht nichts und kann gefahrlos erneut laufen.
set -euo pipefail

if [ ! -s /root/.ssh/authorized_keys ]; then
  echo "Abbruch: Kein SSH-Schlüssel in /root/.ssh/authorized_keys. Erst im Hostinger-Panel hinterlegen, sonst sperrst du dich aus."
  exit 1
fi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get -y upgrade
DEBIAN_FRONTEND=noninteractive apt-get -y install ufw unattended-upgrades fail2ban ca-certificates curl git

# Firewall: nur SSH und Web
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# SSH: kein Passwort, kein root per Passwort
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/10-levarex.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
CONF
systemctl reload ssh || systemctl reload sshd

# Automatische Sicherheits-Updates (Neustart nachts um 4 Uhr, falls nötig)
cat > /etc/apt/apt.conf.d/52levarex-updates <<'CONF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
CONF
systemctl enable --now unattended-upgrades fail2ban

# Docker (offizielles Paket-Repository)
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

mkdir -p /opt/levarex
echo "Fertig. Weiter mit Schritt 4 im Runbook (docs/runbook-server.md)."
