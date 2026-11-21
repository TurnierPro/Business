# Herkunft der Projekt-Skills

Übernommen am 21.11.2026 auf Wunsch von Maximilian Steiner. Jeder Skill wurde vor dem Einbau gelesen;
Teile, die selbst Programme laden, im Hintergrund laufen oder nicht passen, sind weggelassen.

| Skill(s) | Quelle (Commit) | Lizenz | Weggelassen |
|---|---|---|---|
| ui-ux-pro-max | github.com/nextlevelbuilder/ui-ux-pro-max-skill (f76d165) | MIT | Testordner |
| impeccable | github.com/pbakaus/impeccable (b49177d) | Apache-2.0 | `scripts/` (Startskript lädt ein ausführbares Programm aus dem Netz nach) |
| taste (design-taste-frontend) | github.com/Leonxlnx/taste-skill (f6b7657) | siehe LICENSE | Stop-Hook (startete nach jeder Antwort ein Browser-Prüfskript), `assets/` (38 MB Bilder, Stockfotos), `scripts/` |
| archify | github.com/tt-a1i/archify (8509a3d) | MIT | `examples/` (13 MB), `scripts/check-update.mjs` (Netzabruf) |
| ponytail, ponytail-* | github.com/DietrichGebert/ponytail (96608e0) | MIT | – |
| Agent Skills (24, z. B. code-review-and-quality, spec-driven-development) | github.com/addyosmani/agent-skills (8c99fa3) | MIT | Session-Start-Hook |
| ecc-* (16 Auswahl-Skills) | github.com/affaan-m/ECC (4adeee6) | MIT | übrige 300+ Skills, Hooks, Agenten, Befehle; Namen mit „ecc-“ versehen, damit z. B. `security-review` den eingebauten Befehl nicht überdeckt |

## Vorrang

Bei Widersprüchen gelten zuerst `CLAUDE.md` und die Levarex-Skills (Marke, Baukasten, Lieferung), dann diese Skills. Insbesondere:
- keine Stockfotos und keine KI-Bilder (Taste empfiehlt lizenzierte Ersatzfotos: gilt bei Levarex nicht),
- ein Messing-Element pro Bildschirmhöhe, Status immer mit Wort, Deutsch in Code und Oberfläche,
- nichts verlässt das System ohne Freigabe im Postausgang.

Aktualisieren: Repository neu laden, gleich prüfen wie oben, Commit-Hash in dieser Tabelle nachziehen.
