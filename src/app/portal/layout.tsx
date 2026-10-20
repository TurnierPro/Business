import { Logo } from "@/components/Logo";
import { marke } from "@/lib/marke";

export const dynamic = "force-dynamic";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal">
      <div style={{ marginBottom: 32 }}>
        <Logo hoehe={24} />
        <p className="leise klein" style={{ marginTop: 8 }}>{marke.slogan}</p>
      </div>
      {children}
      <p className="leise klein abstand">
        {marke.absender.firma} · {marke.absender.ort} · Tel. {marke.absender.telefon} · {marke.absender.email}
        <br />
        {/* Pflichtangaben (§ 5 DDG) und Datenschutzhinweise (Art. 13 DSGVO) für alle, die das Portal nutzen */}
        <a href={`https://${marke.absender.web}/impressum`} rel="noreferrer" target="_blank">Impressum</a> · <a href={`https://${marke.absender.web}/datenschutz`} rel="noreferrer" target="_blank">Datenschutz</a> · Keine Cookies, kein Tracking.
      </p>
    </div>
  );
}
