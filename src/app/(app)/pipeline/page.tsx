import Link from "next/link";
import { pipeline, prognose } from "@/lib/pipeline";
import { euro } from "@/lib/pakete";

export const metadata = { title: "Pipeline" };

export default async function Pipeline({ searchParams }: { searchParams: Promise<{ wer?: string }> }) {
  const { wer } = await searchParams;
  const stufen = (await pipeline()).map((s) => ({ ...s, karten: wer ? s.karten.filter((k) => k.zustaendig === wer) : s.karten }));
  const liegen = stufen.flatMap((s) => (s.key === "kunde" ? [] : s.karten.filter((k) => k.liegt))).length;
  return (
    <>
      <div className="kopfzeile">
        <div>
          <h1>Pipeline</h1>
          <p>Jeder Betrieb in seiner Stufe. Wert aus dem letzten Angebot, sonst Ø Kaufpreis aus dem Business Case (kursiv). Rot markiert: liegt zu lange ohne Aktivität.</p>
        </div>
      </div>
      <div className="raster vier">
        <div className="kennzahl"><div className="wert">{euro(prognose(stufen))}</div><div className="name">Prognose (gewichtet)</div></div>
        <div className="kennzahl"><div className="wert">{stufen.filter((s) => s.key !== "kunde").reduce((x, s) => x + s.karten.length, 0)}</div><div className="name">Offene Chancen</div></div>
        <div className="kennzahl"><div className="wert" style={liegen ? { color: "var(--fehler)" } : undefined}>{liegen}</div><div className="name">Liegen zu lange</div></div>
        <div className="kennzahl"><div className="wert">{stufen.find((s) => s.key === "kunde")!.karten.length}</div><div className="name">Gewonnen</div></div>
      </div>
      <div className="pipeline abstand" role="list" aria-label="Pipeline-Stufen">
        {stufen.map((s) => (
          <section key={s.key} className="spalte" role="listitem" aria-label={s.name}>
            <h2>{s.name} <span className="leise mono klein">{s.karten.length}</span></h2>
            <div className="klein leise mono">{euro(s.summe)} · {Math.round(s.wahrscheinlichkeit * 100)} % → {euro(s.gewichtet)}</div>
            {s.karten.map((k) => (
              <Link key={k.id} href={`/leads/${k.id}`} className={`karte-klein${k.liegt && s.key !== "kunde" ? " liegt" : ""}`}>
                <div style={{ fontWeight: 600 }}>{k.name}</div>
                <div className="klein leise">{[k.gewerk, k.ort].filter(Boolean).join(" · ")}</div>
                <div className="klein mono" style={{ marginTop: 4, fontStyle: k.geschaetzt ? "italic" : undefined }}>{euro(k.wert)}{k.geschaetzt ? " (geschätzt)" : ""}</div>
                {k.liegt && s.key !== "kunde" ? <div className="klein" style={{ color: "var(--fehler)" }}>liegt seit {k.tageOhneAktivitaet} Tagen</div> : null}
                {k.naechsteAufgabe ? <div className="klein leise">Nächster Schritt: {k.naechsteAufgabe}</div> : s.key !== "kunde" ? <div className="klein leise">Kein nächster Schritt geplant</div> : null}
                {k.zustaendig || k.tags.length ? <div>{k.zustaendig ? <span className="marke-klein">{k.zustaendig}</span> : null}{k.tags.map((t) => <span key={t} className="marke-klein">{t}</span>)}</div> : null}
              </Link>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
