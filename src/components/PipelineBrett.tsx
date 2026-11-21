"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { euro } from "@/lib/pakete";

// Pipeline zum Ziehen: Karte greifen und auf eine andere Spalte legen. Ohne Maus: Auswahl „Stufe ändern“ in der Karte.
type Karte = { id: number; name: string; ort: string | null; gewerk: string; wert: number; geschaetzt: boolean; tageOhneAktivitaet: number; liegt: boolean; zustaendig: string | null; naechsteAufgabe: string | null };
type Stufe = { key: string; name: string; summe: number; karten: Karte[] };

export function PipelineBrett({ stufen, verschieben }: { stufen: Stufe[]; verschieben: (id: number, ziel: string) => Promise<{ fehler?: string }> }) {
  const router = useRouter();
  const [spalten, setSpalten] = useState(stufen);
  const [ziehe, setZiehe] = useState<number | null>(null);
  const [ueber, setUeber] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ text: string; fehler: boolean } | null>(null);
  const [laeuft, starte] = useTransition();
  const ziele = stufen.filter((s) => s.key !== "kunde");

  function bewege(id: number, ziel: string) {
    const von = spalten.find((s) => s.karten.some((k) => k.id === id));
    if (!von || von.key === ziel) return;
    if (ziel === "kunde") return setMeldung({ text: "Zum Kunden wird ein Betrieb mit der Unterschrift, nicht durch Verschieben.", fehler: true });
    const karte = von.karten.find((k) => k.id === id)!;
    const vorher = spalten;
    setSpalten(spalten.map((s) => (s.key === von.key ? { ...s, karten: s.karten.filter((k) => k.id !== id) } : s.key === ziel ? { ...s, karten: [karte, ...s.karten] } : s)));
    starte(async () => {
      const r = await verschieben(id, ziel);
      if (r.fehler) {
        setSpalten(vorher);
        setMeldung({ text: r.fehler, fehler: true });
      } else {
        setMeldung({ text: `${karte.name}: jetzt „${stufen.find((s) => s.key === ziel)?.name}“.${ziel === "interessant" && von.key === "neu" ? " Online-Check, Demo und Brief werden vorbereitet." : ""}`, fehler: false });
        router.refresh();
      }
    });
  }

  return (
    <>
      <div aria-live="polite">{meldung ? <div className={`hinweis${meldung.fehler ? " fehler" : " ok"}`}>{meldung.text}</div> : null}</div>
      <div className="pipeline abstand" role="list" aria-label="Pipeline-Stufen" aria-busy={laeuft}>
        {spalten.map((s) => (
          <section
            key={s.key}
            className={`spalte${ueber === s.key ? " ziel" : ""}`}
            role="listitem"
            aria-label={s.name}
            onDragOver={(e) => { if (ziehe !== null) { e.preventDefault(); setUeber(s.key); } }}
            onDragLeave={() => setUeber((u) => (u === s.key ? null : u))}
            onDrop={(e) => { e.preventDefault(); setUeber(null); if (ziehe !== null) bewege(ziehe, s.key); setZiehe(null); }}
          >
            <div className="spalte-kopf"><h2>{s.name}</h2><span className="anzahl">{s.karten.length}</span></div>
            <div className="klein leise">{s.karten.length ? `${euro(s.karten.reduce((x, k) => x + k.wert, 0))} ${s.key === "kunde" ? "Auftragswert" : "möglich"}` : "leer"}</div>
            {s.karten.map((k) => (
              <article key={k.id} className={`karte-klein${k.liegt && s.key !== "kunde" ? " liegt" : ""}${ziehe === k.id ? " zieht" : ""}`} draggable={s.key !== "kunde"} onDragStart={(e) => { setZiehe(k.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { setZiehe(null); setUeber(null); }}>
                <Link href={`/leads/${k.id}`} className="name" draggable={false}>{k.name}</Link>
                <div className="klein leise">{[k.gewerk, k.ort].filter(Boolean).join(" · ")}</div>
                <div className="klein" style={{ marginTop: 6 }}>{k.geschaetzt ? "ca. " : ""}{euro(k.wert)}</div>
                {k.liegt && s.key !== "kunde" ? <div style={{ marginTop: 6 }}><span className="status fehler">seit {k.tageOhneAktivitaet} Tagen still</span></div> : null}
                {k.naechsteAufgabe ? <div className="klein leise" style={{ marginTop: 6 }}>{k.naechsteAufgabe}</div> : null}
                {k.zustaendig ? <div><span className="marke-klein">{k.zustaendig}</span></div> : null}
                {s.key !== "kunde" ? (
                  <select className="stufe-waehlen" aria-label={`Stufe von ${k.name} ändern`} value="" onChange={(e) => e.target.value && bewege(k.id, e.target.value)}>
                    <option value="">Stufe ändern …</option>
                    {ziele.filter((z) => z.key !== s.key).map((z) => <option key={z.key} value={z.key}>{z.name}</option>)}
                  </select>
                ) : null}
              </article>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
