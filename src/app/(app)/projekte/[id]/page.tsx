import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { Status } from "@/components/Status";
import { datum } from "@/lib/format";
import { basisUrl } from "@/lib/ablauf/gemeinsam";
import { PAKETE, PaketKey } from "@/lib/pakete";
import { neuBauen } from "../../aktionen";

const SCHRITTE = [
  { key: "inhalte", text: "Inhalte vom Kunden" },
  { key: "bau", text: "Bau" },
  { key: "pruefung", text: "Prüfung" },
  { key: "bereit", text: "Freigabe Livegang" },
  { key: "live", text: "Live" },
];

export default async function Projekt({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = await getDb();
  const [p] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, id));
  if (!p) notFound();
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, p.betriebId));
  const [seite] = p.seitenSlug ? await db.select().from(schema.seiten).where(eq(schema.seiten.slug, p.seitenSlug)) : [];
  const livegang = (await db.select().from(schema.postausgang).where(eq(schema.postausgang.projektId, id))).find((e) => e.zweck === "livegang" && e.status === "zur_freigabe");
  const index = SCHRITTE.findIndex((s) => s.key === (p.status === "pruefung" ? "pruefung" : p.status));
  const portal = `${basisUrl()}/portal/${p.portalToken}`;

  return (
    <>
      <Link href="/projekte" className="zurueck">← Projekte</Link>
      <div className="kopfzeile">
        <div><h1>{b.name}</h1><p>{PAKETE[p.paket as PaketKey].name}{p.domain ? ` · ${p.domain}` : ""}</p></div>
        <Status wert={p.status} />
      </div>
      <ol className="schritte" aria-label="Fortschritt">
        {SCHRITTE.map((s, i) => <li key={s.key} className={i < index ? "erledigt" : i === index ? "aktuell" : ""}>{s.text}</li>)}
      </ol>

      <div className="raster zwei" style={{ alignItems: "start" }}>
        <section className="karte">
          <h2>Als Nächstes</h2>
          {p.status === "inhalte" ? <><p>Wir warten auf Texte und Fotos. Der Kunde hat den Link mit der Start-Mail bekommen.</p><p className="leise klein mono" style={{ wordBreak: "break-all" }}>{portal}</p></> : null}
          {p.status === "bau" ? <p>Die Seite wird gerade gebaut und geprüft. In einer Minute neu laden.</p> : null}
          {p.status === "pruefung" ? <><div className="hinweis fehler">Die Prüfung ist nicht bestanden. Der Livegang ist gesperrt, bis alles grün ist.</div><form action={neuBauen}><input type="hidden" name="id" value={id} /><button className="knopf">Neu bauen und prüfen</button></form></> : null}
          {p.status === "bereit" && livegang ? <><p>Alle Prüfungen bestanden. Bitte die Vorschau ansehen und den Livegang freigeben.</p><Link className="knopf haupt" href={`/freigaben/${livegang.id}`}>Zur Freigabe</Link></> : null}
          {p.status === "live" ? <p>Live seit {datum(p.liveAm)}. Betreuung läuft seit {datum(p.aboAb)}. Die Seite wird alle 10 Minuten geprüft.</p> : null}
          {seite ? <p style={{ marginTop: 16 }}><a className="knopf klein" target="_blank" href={`/vorschau/${seite.slug}${seite.zugangscode ? `?code=${seite.zugangscode}` : ""}`}>Seite ansehen</a></p> : null}
        </section>

        <section className="karte">
          <h2>Qualitätsprüfung</h2>
          {p.pruefung?.length ? (
            <ul className="liste">
              {p.pruefung.map((x) => (
                <li key={x.name}><div><div className="titel">{x.name}</div><div className="unter">{x.detail}</div></div><Status wert={x.ok ? "bestanden" : "fehler"} /></li>
              ))}
            </ul>
          ) : <p className="leise">Läuft nach dem ersten Bau.</p>}
        </section>
      </div>
    </>
  );
}
