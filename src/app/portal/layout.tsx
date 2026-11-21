import { Logo } from "@/components/Logo";
import { marke } from "@/lib/marke";

export const dynamic = "force-dynamic";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal-seite">
      <header className="portal-kopf">
        <div className="innen">
          <Logo hoehe={26} />
          <span className="etikett">Mein Levarex</span>
        </div>
      </header>
      <main className="portal">{children}</main>
      <footer className="portal-fuss">
        {marke.absender.firma} · Sitz {marke.absender.sitz} · Tel. {marke.absender.telefon} · {marke.absender.email}
        <br />
        {/* Pflichtangaben (§ 5 DDG) und Datenschutzhinweise (Art. 13 DSGVO) für alle, die das Portal nutzen */}
        <a href={`https://${marke.absender.web}/impressum`} rel="noreferrer" target="_blank">Impressum</a> · <a href={`https://${marke.absender.web}/datenschutz`} rel="noreferrer" target="_blank">Datenschutz</a> · Keine Cookies, kein Tracking.
      </footer>
    </div>
  );
}
