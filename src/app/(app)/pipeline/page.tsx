import Link from "next/link";
import { pipeline, prognose } from "@/lib/pipeline";
import { euro } from "@/lib/pakete";

export const metadata = { title: "Pipeline" };

export default async function Pipeline({ searchParams }: { searchParams: Promise<{ wer?: string }> }) {
  const { wer } = await searchParams;
  const stufen = (await pipeline()).map((s) => ({ ...s, karten: wer ? s.karten.filter((k) => k.zustaendig === wer) : s.karten }));
  const liegen = stufen.flatMap((s) => (s.key === "kunde" ? [] : s.karten.filter((k) => k.liegt))).length;
  const offen = stufen.filter((s) => s.key !== "kunde").reduce((x, s) => x + s.karten.length, 0);
  return (
    <>
      <div className="kopfzeile">
        <div>
          <h1>Pipeline</h1>
          <p>Jeder Betrieb in seiner Stufe. Karte antippen öffnet den Betrieb.</p>
        </div>
      </div>
      <div className="raster drei">
        <div className="kennzahl"><div className="wert">{offen}</div><div className="name">offene Chancen</div></div>
        <div className="kennzahl" title="Summe der Angebote je Stufe mal Abschluss-Wahrscheinlichkeit der Stufe"><div className="wert">{euro(prognose(stufen))}</div><div className="name">erwarteter Umsatz (gewichtet, einmalig)</div></div>
        <div className="kennzahl"><div className="wert" style={liegen ? { color: "var(--fehler)" } : undefined}>{liegen}</div><div className="name">{liegen === 1 ? "liegt" : "liegen"} zu lange ohne Kontakt</div></div>
      </div>
      <div className="pipeline abstand" role="list" aria-label="Pipeline-Stufen">
        {stufen.map((s) => (
          <section key={s.key} className="spalte" role="listitem" aria-label={s.name}>
            <div className="spalte-kopf">
              <h2>{s.name}</h2>
              <span className="anzahl">{s.karten.length}</span>
            </div>
            {s.karten.length ? <div className="klein leise" title={`${Math.round(s.wahrscheinlichkeit * 100)} % Wahrscheinlichkeit → ${euro(s.gewichtet)}`}>{euro(s.summe)} {s.key === "kunde" ? "Auftragswert" : "möglich"}</div> : <div className="klein leise">leer</div>}
            {s.karten.map((k) => (
              <Link key={k.id} href={`/leads/${k.id}`} className={`karte-klein${k.liegt && s.key !== "kunde" ? " liegt" : ""}`}>
                <div className="name">{k.name}</div>
                <div className="klein leise">{[k.gewerk, k.ort].filter(Boolean).join(" · ")}</div>
                <div className="klein" style={{ marginTop: 6 }}>{k.geschaetzt ? "ca. " : ""}{euro(k.wert)}</div>
                {k.liegt && s.key !== "kunde" ? <div style={{ marginTop: 6 }}><span className="status fehler">seit {k.tageOhneAktivitaet} Tagen still</span></div> : null}
                {k.naechsteAufgabe ? <div className="klein leise" style={{ marginTop: 6 }}>{k.naechsteAufgabe}</div> : null}
                {k.zustaendig ? <div><span className="marke-klein">{k.zustaendig}</span></div> : null}
              </Link>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
