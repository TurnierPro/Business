import { VERSION, VERSION_DATUM } from "@/lib/version";

// Schwarzer Fuß wie auf der Website, nur auf den Anmeldeseiten. Rechtstexte liegen auf der Website.
const WEB = "https://levarex-consulting.de";

export function AnmeldeFuss() {
  return (
    <footer className="anmelde-fuss">
      <span>© {new Date().getFullYear()} Levarex Consulting GmbH i. G.</span>
      <nav aria-label="Rechtliches">
        <a href={`${WEB}/impressum`} target="_blank" rel="noopener noreferrer">Impressum</a>
        <a href={`${WEB}/datenschutz`} target="_blank" rel="noopener noreferrer">Datenschutz</a>
        <a href={`${WEB}/barrierefreiheit`} target="_blank" rel="noopener noreferrer">Barrierefreiheit</a>
        <span className="anmelde-version" title={`Stand ${VERSION_DATUM}`}>Version {VERSION}</span>
      </nav>
    </footer>
  );
}
