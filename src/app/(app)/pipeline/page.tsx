import { PipelineBrett } from "@/components/PipelineBrett";
import { stufeVerschieben } from "../aktionen";
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
      <p className="leise klein abstand" style={{ marginBottom: 0 }}>Karte greifen und auf eine andere Stufe ziehen; ohne Maus über „Stufe ändern“ in der Karte. „Gewonnen“ wird ein Betrieb nur durch die Unterschrift.</p>
      <PipelineBrett stufen={stufen.map((s) => ({ key: s.key, name: s.name, summe: s.summe, karten: s.karten.map((k) => ({ id: k.id, name: k.name, ort: k.ort, gewerk: k.gewerk, wert: k.wert, geschaetzt: k.geschaetzt, tageOhneAktivitaet: k.tageOhneAktivitaet, liegt: k.liegt, zustaendig: k.zustaendig, naechsteAufgabe: k.naechsteAufgabe })) }))} verschieben={stufeVerschieben} />
    </>
  );
}
