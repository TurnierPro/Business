import { Logo } from "@/components/Logo";
import { AnmeldeFuss } from "@/components/AnmeldeFuss";
import { Barrierefreiheit } from "@/components/Barrierefreiheit";

export const dynamic = "force-dynamic";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal-seite">
      <header className="portal-kopf">
        <div className="innen">
          <Logo hoehe={26} />
          <div className="portal-kopf-rechts">
            <span className="etikett">Mein Levarex</span>
            <Barrierefreiheit />
          </div>
        </div>
      </header>
      <main className="portal">{children}</main>
      {/* Pflichtangaben (§ 5 DDG) und Datenschutzhinweise (Art. 13 DSGVO) für alle, die das Portal nutzen; keine Cookies, kein Tracking */}
      <AnmeldeFuss mitKontakt mitVersion={false} />
    </div>
  );
}
