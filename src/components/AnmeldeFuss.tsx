import { VERSION, VERSION_DATUM } from "@/lib/version";
import { marke } from "@/lib/marke";

// Schwarzer Fuß wie auf der Website: auf den Anmeldeseiten und im Kundenportal. Rechtstexte liegen auf der Website.
// mitKontakt: Telefon und E-Mail (Kundenportal); mitVersion: Versionsnummer (Anmeldung).
export function AnmeldeFuss({ mitKontakt = false, mitVersion = true }: { mitKontakt?: boolean; mitVersion?: boolean }) {
  const a = marke.absender;
  const web = `https://${a.web}`;
  return (
    <footer className="anmelde-fuss">
      <span>© {new Date().getFullYear()} {a.firma}{mitKontakt ? ` · Sitz ${a.sitz}` : ""}</span>
      {mitKontakt ? (
        <span className="anmelde-kontakt">
          <a href={`tel:${a.telefon.replace(/\s/g, "")}`}>{a.telefon}</a>
          <a href={`mailto:${a.email}`}>{a.email}</a>
        </span>
      ) : null}
      <nav aria-label="Rechtliches">
        <a href={`${web}/impressum`} target="_blank" rel="noopener noreferrer">Impressum</a>
        <a href={`${web}/datenschutz`} target="_blank" rel="noopener noreferrer">Datenschutz</a>
        <a href={`${web}/barrierefreiheit`} target="_blank" rel="noopener noreferrer">Barrierefreiheit</a>
        {mitVersion ? <span className="anmelde-version" title={`Stand ${VERSION_DATUM}`}>Version {VERSION}</span> : null}
      </nav>
    </footer>
  );
}
