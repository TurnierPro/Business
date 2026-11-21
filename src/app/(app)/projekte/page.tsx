import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { Status } from "@/components/Status";
import { datum } from "@/lib/format";
import { PAKETE, PaketKey, euro } from "@/lib/pakete";
import { bereitgestellt, lieferfristBis } from "@/lib/ablauf/lieferfrist";

export const metadata = { title: "Kunden" };

// Kunden = Betriebe, die das Angebot angenommen haben. Jeder Kunde hat sein Projekt; danach läuft die Betreuung.
const KUNDENWEG = ["Anzahlung", "Inhalte", "Bau und Prüfung", "Vorschau und Abnahme", "Livegang"];

type Projekt = typeof schema.projekte.$inferSelect;

function stufe(p: Projekt | undefined): number {
  if (!p) return 0;
  if (p.status === "inhalte") return 1;
  if (p.status === "bau" || p.status === "pruefung") return 2;
  if (p.status === "bereit") return ["abgenommen", "vorbehalt", "fiktion"].includes(p.abnahmeStatus ?? "") ? 4 : 3;
  return KUNDENWEG.length; // live oder beendet
}

export default async function Kunden({ searchParams }: { searchParams: Promise<{ zeige?: string }> }) {
  const { zeige = "alle" } = await searchParams;
  const db = await getDb();
  const kunden = await db.select().from(schema.betriebe).where(eq(schema.betriebe.status, "kunde")).orderBy(desc(schema.betriebe.letzteAktivitaet));
  const ids = kunden.map((k) => k.id);
  const [projekte, angebote, tickets] = ids.length
    ? await Promise.all([
        db.select().from(schema.projekte).where(inArray(schema.projekte.betriebId, ids)).orderBy(desc(schema.projekte.erstelltAm)),
        db.select().from(schema.angebote).where(inArray(schema.angebote.betriebId, ids)).orderBy(desc(schema.angebote.erstelltAm)),
        db.select().from(schema.tickets).where(inArray(schema.tickets.betriebId, ids)),
      ])
    : [[], [], []];
  const zeilen = kunden.map((b) => {
    const p = projekte.find((x) => x.betriebId === b.id);
    return { b, p, a: angebote.find((x) => x.betriebId === b.id), i: stufe(p), offeneTickets: tickets.filter((t) => t.betriebId === b.id && t.status !== "erledigt").length };
  });
  const inArbeit = zeilen.filter((z) => z.i < KUNDENWEG.length);
  const betreut = zeilen.filter((z) => z.i >= KUNDENWEG.length);
  const sichtbar = zeige === "projekt" ? inArbeit : zeige === "betreuung" ? betreut : zeilen;
  const monatlich = betreut.reduce((s, z) => s + (z.a?.monatlich ?? 0), 0);

  return (
    <>
      <div className="kopfzeile"><div><h1>Kunden</h1><p>Alle, die das Angebot angenommen haben: erst das Projekt, dann die Betreuung.</p></div></div>
      <div className="raster drei" style={{ marginBottom: 16 }}>
        <div className="kennzahl"><div className="wert">{inArbeit.length}</div><div className="name">im Projekt</div></div>
        <div className="kennzahl"><div className="wert">{betreut.length}</div><div className="name">in der Betreuung</div></div>
        <div className="kennzahl"><div className="wert">{euro(monatlich)}</div><div className="name">Monatsbeiträge netto (Betreuung)</div></div>
      </div>
      <nav className="reiter" aria-label="Filter">
        {[["alle", `Alle ${zeilen.length}`], ["projekt", `Im Projekt ${inArbeit.length}`], ["betreuung", `Betreuung ${betreut.length}`]].map(([k, n]) => (
          <Link key={k} href={`/projekte?zeige=${k}`} aria-current={zeige === k ? "page" : undefined}>{n}</Link>
        ))}
      </nav>
      {sichtbar.length ? (
        <ul className="betriebsliste">
          {sichtbar.map(({ b, p, a, i, offeneTickets }) => {
            const frist = p ? lieferfristBis(p) : null;
            const fertig = i >= KUNDENWEG.length;
            return (
              <li key={b.id}>
                <Link href={p ? `/projekte/${p.id}` : `/leads/${b.id}`} className="betriebszeile">
                  <span className="wer">
                    <span className="name">{b.name}</span>
                    <span className="leise klein">{PAKETE[(p?.paket ?? a?.paket) as PaketKey]?.name ?? "–"}{p?.domain ? ` · ${p.domain}` : ""}</span>
                  </span>
                  <span className="stand">
                    <span className="klein">{fertig ? "Betreuung läuft" : `${i + 1} von ${KUNDENWEG.length} · ${KUNDENWEG[i]}`}</span>
                    <span className="portal-balken" aria-hidden="true" style={{ height: 6 }}><span style={{ width: `${Math.round((i / KUNDENWEG.length) * 100)}%` }} /></span>
                  </span>
                  <span className="naechst klein">
                    {!p ? `Erste Rate offen (${euro(Math.round((a?.einmalig ?? 0) / 2))} netto)` : p.liveAm ? `live seit ${datum(p.liveAm)}${offeneTickets ? ` · ${offeneTickets} Ticket${offeneTickets > 1 ? "s" : ""} offen` : ""}` : frist && !bereitgestellt(p) ? `Vorschau spätestens ${datum(frist)}` : p.abnahmeFrist && i === 3 ? `Abnahme bis ${datum(p.abnahmeFrist)}` : ""}
                  </span>
                  <span className="rechts">{p ? <Status wert={p.status} /> : <span className="status warten">Anzahlung offen</span>}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="karte leer"><strong>Noch keine Kunden.</strong>Ein Betrieb wird zum Kunden, sobald er das Angebot unterschrieben hat.</div>
      )}
    </>
  );
}
