import Link from "next/link";
import { PipelineBrett } from "@/components/PipelineBrett";
import { stufeVerschieben } from "../aktionen";
import { kundenSpalten, pipeline, prognose } from "@/lib/pipeline";
import { euro } from "@/lib/pakete";
import { getDb, schema } from "@/lib/db";
import { AufEinenBlick, SeitenKopf } from "@/components/Seite";

export const metadata = { title: "Pipeline" };

// Pipeline: Leads und Kunden getrennt, damit die Tafel nicht zu breit wird. Als Tafel (ziehen) oder als Liste (viele Betriebe).
type Suche = { wer?: string; teil?: string; ansicht?: string; stufe?: string };

export default async function Pipeline({ searchParams }: { searchParams: Promise<Suche> }) {
  const sp = await searchParams;
  const teil = sp.teil === "kunden" ? "kunden" : "leads";
  const ansicht = sp.ansicht === "liste" ? "liste" : "tafel";
  const wer = sp.wer ?? "";
  const [kundenRoh, leadStufen, benutzer] = await Promise.all([kundenSpalten(), pipeline(), (await getDb()).select({ name: schema.benutzer.name }).from(schema.benutzer)]);
  const nurWer = <T extends { zustaendig: string | null }>(l: T[]) => (wer ? l.filter((k) => k.zustaendig === wer) : l);
  const leads = leadStufen.filter((s) => s.key !== "kunde").map((s) => ({ ...s, karten: nurWer(s.karten) }));
  const kunden = kundenRoh.map((s) => ({ ...s, karten: nurWer(s.karten) }));
  const spalten = teil === "leads"
    ? leads.map((s) => ({ key: s.key, name: s.name, summe: s.summe, karten: s.karten.map((k) => ({ id: k.id, name: k.name, ort: k.ort, gewerk: k.gewerk, wert: k.wert, geschaetzt: k.geschaetzt, tageOhneAktivitaet: k.tageOhneAktivitaet, liegt: k.liegt, zustaendig: k.zustaendig, naechsteAufgabe: k.naechsteAufgabe })) }))
    : kunden;
  const sichtbar = sp.stufe ? spalten.filter((s) => s.key === sp.stufe) : spalten;
  const liegen = leads.flatMap((s) => s.karten.filter((k) => k.liegt)).length;
  const offen = leads.reduce((x, s) => x + s.karten.length, 0);
  const imProjekt = kunden.filter((k) => k.key !== "k_live").reduce((x, s) => x + s.karten.length, 0);
  const live = kunden.find((k) => k.key === "k_live")?.karten.length ?? 0;
  const link = (q: Partial<Suche>) => {
    const p = new URLSearchParams(Object.entries({ teil, ansicht, wer, ...q }).filter(([, v]) => v) as [string, string][]);
    return `/pipeline?${p.toString()}`;
  };

  return (
    <>
      <SeitenKopf titel="Pipeline" text="Wo steht jeder Betrieb? Leads bis zur Unterschrift, danach Kunden bis zum Livegang." />
      <AufEinenBlick werte={[
        { wert: offen, name: "offene Leads", href: link({ teil: "leads", stufe: "" }) },
        { wert: euro(prognose(leads)).replace(",00", ""), name: "erwarteter Umsatz (gewichtet)" },
        { wert: liegen, name: liegen === 1 ? "liegt zu lange still" : "liegen zu lange still", ton: liegen ? "fehler" : "ok" },
        { wert: imProjekt, name: "Kunden im Projekt", href: link({ teil: "kunden", stufe: "" }) },
        { wert: live, name: "Kunden live", ton: "ok", href: link({ teil: "kunden", stufe: "k_live" }) },
      ]} />

      <div className="filterleiste" style={{ justifyContent: "space-between" }}>
        <nav className="reiter klein-reiter" aria-label="Teil der Pipeline">
          <Link href={link({ teil: "leads", stufe: "" })} aria-current={teil === "leads" ? "page" : undefined}>Leads <span className="reiter-zahl">{offen}</span></Link>
          <Link href={link({ teil: "kunden", stufe: "" })} aria-current={teil === "kunden" ? "page" : undefined}>Kunden <span className="reiter-zahl">{imProjekt + live}</span></Link>
        </nav>
        <div className="knopfreihe" style={{ gap: 8 }}>
          <nav className="reiter klein-reiter" aria-label="Ansicht">
            <Link href={link({ ansicht: "tafel" })} aria-current={ansicht === "tafel" ? "page" : undefined}>Tafel</Link>
            <Link href={link({ ansicht: "liste" })} aria-current={ansicht === "liste" ? "page" : undefined}>Liste</Link>
          </nav>
          <nav className="reiter klein-reiter" aria-label="Zuständig">
            <Link href={link({ wer: "" })} aria-current={!wer ? "page" : undefined}>Alle</Link>
            {benutzer.map((b) => <Link key={b.name} href={link({ wer: b.name })} aria-current={wer === b.name ? "page" : undefined}>{b.name.split(" ")[0]}</Link>)}
          </nav>
        </div>
      </div>

      {/* Stufenleiste: Anzahl je Stufe auf einen Blick; antippen filtert */}
      <nav className="stufenleiste" aria-label="Stufen">
        {spalten.map((s) => (
          <Link key={s.key} href={link({ stufe: sp.stufe === s.key ? "" : s.key })} aria-current={sp.stufe === s.key ? "page" : undefined} className={s.karten.length ? "" : "leer"}>
            <span className="zahl">{s.karten.length}</span>
            <span className="name">{s.name}</span>
            <span className="summe">{s.karten.length ? euro(s.karten.reduce((x, k) => x + k.wert, 0)).replace(",00", "") : "–"}</span>
          </Link>
        ))}
      </nav>

      {ansicht === "tafel" ? (
        <>
          <PipelineBrett key={`${teil}-${wer}-${sp.stufe ?? ""}`} stufen={sichtbar} verschieben={stufeVerschieben} />
          {teil === "leads" ? <p className="leise klein">Karte auf eine andere Stufe ziehen oder „Stufe ändern“ in der Karte. Kunde wird ein Betrieb nur durch die Unterschrift.</p> : <p className="leise klein">Kunden wandern von selbst weiter: Zahlung, Inhalte, Abnahme, Livegang.</p>}
        </>
      ) : (
        <section className="karte">
          <table className="tabelle">
            <thead><tr><th>Betrieb</th><th className="weg-mobil">Stufe</th><th className="zahl">Wert</th><th className="weg-mobil">Nächster Schritt</th><th className="weg-mobil">Zuständig</th><th>Stand</th></tr></thead>
            <tbody>
              {sichtbar.flatMap((s) => s.karten.map((k) => (
                <tr key={`${s.key}-${k.id}`}>
                  <td><Link href={"href" in k && k.href ? String(k.href) : `/leads/${k.id}`}>{k.name}</Link><div className="leise klein">{[k.gewerk, k.ort].filter(Boolean).join(" · ")}</div></td>
                  <td className="klein weg-mobil">{s.name}</td>
                  <td className="zahl" style={{ whiteSpace: "nowrap" }}>{k.geschaetzt ? "ca. " : ""}{euro(k.wert).replace(",00", "")}</td>
                  <td className="weg-mobil klein leise">{k.naechsteAufgabe ?? "–"}</td>
                  <td className="weg-mobil klein">{k.zustaendig ?? "–"}</td>
                  <td>{k.liegt ? <span className="status fehler">{k.tageOhneAktivitaet} Tage still</span> : <span className="status ok">aktiv</span>}</td>
                </tr>
              )))}
            </tbody>
          </table>
          {!sichtbar.some((s) => s.karten.length) ? <div className="leer"><strong>Keine Betriebe in dieser Auswahl.</strong></div> : null}
        </section>
      )}
    </>
  );
}
