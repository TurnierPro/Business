import { PipelineBrett } from "@/components/PipelineBrett";
import { stufeVerschieben } from "../aktionen";
import { kundenSpalten, pipeline, prognose } from "@/lib/pipeline";
import { euro } from "@/lib/pakete";

export const metadata = { title: "Pipeline" };

export default async function Pipeline({ searchParams }: { searchParams: Promise<{ wer?: string }> }) {
  const { wer } = await searchParams;
  const kunden = await kundenSpalten();
  const stufen = (await pipeline()).filter((s) => s.key !== "kunde").map((s) => ({ ...s, karten: wer ? s.karten.filter((k) => k.zustaendig === wer) : s.karten }));
  const liegen = stufen.flatMap((s) => s.karten.filter((k) => k.liegt)).length;
  const offen = stufen.reduce((x, s) => x + s.karten.length, 0);
  const imProjekt = kunden.filter((k) => k.key !== "k_live").reduce((x, s) => x + s.karten.length, 0);
  return (
    <>
      <div className="kopfzeile">
        <div>
          <h1>Pipeline</h1>
          <p>Der ganze Weg auf einer Tafel: links die Leads bis zum Angebot, rechts die Kunden bis zum Livegang. Karte antippen öffnet Betrieb oder Projekt.</p>
        </div>
      </div>
      <div className="raster vier">
        <div className="kennzahl"><div className="wert">{offen}</div><div className="name">offene Chancen</div></div>
        <div className="kennzahl"><div className="wert">{imProjekt}</div><div className="name">Kunden im Projekt</div></div>
        <div className="kennzahl" title="Summe der Angebote je Stufe mal Abschluss-Wahrscheinlichkeit der Stufe"><div className="wert">{euro(prognose(stufen))}</div><div className="name">erwarteter Umsatz (gewichtet, einmalig)</div></div>
        <div className="kennzahl"><div className="wert" style={liegen ? { color: "var(--fehler)" } : undefined}>{liegen}</div><div className="name">{liegen === 1 ? "liegt" : "liegen"} zu lange ohne Kontakt</div></div>
      </div>
      <p className="leise klein abstand" style={{ marginBottom: 0 }}>Karte greifen und auf eine andere Stufe ziehen; ohne Maus über „Stufe ändern“ in der Karte. Kunde wird ein Betrieb nur durch die Unterschrift; danach wandert er von selbst weiter (Zahlung, Inhalte, Abnahme, Livegang).</p>
      <PipelineBrett stufen={[...stufen.map((s) => ({ key: s.key, name: s.name, summe: s.summe, karten: s.karten.map((k) => ({ id: k.id, name: k.name, ort: k.ort, gewerk: k.gewerk, wert: k.wert, geschaetzt: k.geschaetzt, tageOhneAktivitaet: k.tageOhneAktivitaet, liegt: k.liegt, zustaendig: k.zustaendig, naechsteAufgabe: k.naechsteAufgabe })) })), ...kunden]} verschieben={stufeVerschieben} />
    </>
  );
}
