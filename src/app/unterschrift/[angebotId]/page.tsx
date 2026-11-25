import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { brauchtBenutzer } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { Logo } from "@/components/Logo";
import { UnterschriftFeld } from "@/components/UnterschriftFeld";
import { UnterschriftPruefung } from "@/components/UnterschriftPruefung";
import { vertragsunterlagen } from "@/lib/ablauf/vertraege";
import { euro } from "@/lib/pakete";
import { laufzeitSumme } from "@/lib/katalog";
import { DOKART } from "@/lib/format";
import { AGB_URL, AGB_VERSION, ERSTATTUNG_WOCHEN, VORABANKUENDIGUNG_TAGE } from "@/lib/recht";
import { aktivesMandat, ibanMaskiert } from "@/lib/ablauf/mandat";
import { vertragUnterschreiben } from "../../(app)/aktionen";

export const metadata = { title: "Verträge unterschreiben", robots: { index: false } };
export const dynamic = "force-dynamic";

// Unterschrift beim Termin auf Daniels Tablet. Sieht aus wie das Kundenportal, ist aber nur mit Anmeldung erreichbar.
export default async function Unterschrift({ params, searchParams }: { params: Promise<{ angebotId: string }>; searchParams: Promise<{ fehler?: string }> }) {
  const ich = await brauchtBenutzer();
  const angebotId = Number((await params).angebotId);
  const { fehler } = await searchParams;
  const db = await getDb();
  const [a] = await db.select().from(schema.angebote).where(eq(schema.angebote.id, angebotId));
  if (!a) notFound();
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, a.betriebId));
  if (!b) notFound();
  const offen = ["entwurf", "versendet"].includes(a.status);
  const doks = offen ? await vertragsunterlagen(angebotId) : [];
  const summe = laufzeitSumme(a.einmalig, a.monatlich);
  const mandat = offen && a.monatlich > 0 ? await aktivesMandat(b.id) : null;
  // Wo steht die Angebots-Mail? Noch zur Freigabe, freigegeben (Versand läuft oder scheiterte) oder schon raus
  const mails = a.status === "entwurf" ? (await db.select({ status: schema.postausgang.status, fehler: schema.postausgang.fehler, meta: schema.postausgang.meta }).from(schema.postausgang).where(and(eq(schema.postausgang.betriebId, b.id), eq(schema.postausgang.zweck, "angebot")))).filter((m) => (m.meta as { angebotId?: number }).angebotId === a.id) : [];
  const mailStand = mails.some((m) => m.status === "zur_freigabe") ? "freigabe" : mails.some((m) => m.status === "freigegeben" && m.fehler) ? "fehler" : mails.some((m) => m.status === "freigegeben") ? "unterwegs" : null;

  return (
    <div className="portal-seite">
      <header className="portal-kopf"><div className="innen"><Logo hoehe={26} /><span className="etikett">Vertrag · {b.name}</span></div></header>
      <main className="portal">
        <Link href={`/leads/${b.id}`} className="zurueck">← zurück zu Levarex OS</Link>
        {!offen ? (
          <div className="karte"><h1>Schon erledigt</h1><p>{a.status === "ueberholt" ? "Dieses Angebot wurde durch ein neueres ersetzt. Bitte das aktuelle Angebot in der Kundenakte öffnen." : "Dieses Angebot ist bereits unterschrieben."}</p></div>
        ) : (
          <form id="vertrag-form" action={vertragUnterschreiben} style={{ display: "grid", gap: 20 }}>
            <input type="hidden" name="angebotId" value={a.id} />
            <section className="portal-held">
              <div><p className="gruss">Ihr Auftrag an Levarex</p><h1>{b.name}</h1></div>
              <div className="raster zwei" style={{ gap: 12 }}>
                <div className="kennzahl"><div className="wert">{euro(a.einmalig)}</div><div className="name">einmalig netto</div></div>
                <div className="kennzahl"><div className="wert">{euro(a.monatlich)}</div><div className="name">Monatsbeitrag netto</div></div>
              </div>
              <p className="leise klein" style={{ margin: 0 }}>Gesamt {summe.monate} Monate {euro(summe.gesamt)} netto, im Schnitt {euro(summe.schnitt)} im Monat. Bitte jedes Dokument ansehen und einzeln unterschreiben.</p>
            </section>
            {fehler ? <div className="hinweis fehler" role="alert">{fehler}</div> : null}
            {mailStand === "freigabe" ? <div className="hinweis">Die Angebots-Mail liegt noch in den Freigaben. Unterschreiben vor Ort geht trotzdem; die Mail wird dann automatisch zurückgezogen.</div> : null}
            {mailStand === "fehler" ? <div className="hinweis">Die Angebots-Mail ist freigegeben, konnte aber nicht versendet werden. Unterschreiben vor Ort geht trotzdem.</div> : null}
            {mailStand === "unterwegs" ? <div className="hinweis">Die Angebots-Mail ist freigegeben und wird gerade versendet.</div> : null}

            {doks.map((d) => (
              <section key={d.id} className="karte">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                  <h2 style={{ margin: 0 }}>{d.titel}</h2>
                  <a className="knopf klein" href={`/dokument/${d.id}/ansicht`} target="_blank">Dokument ansehen</a>
                </div>
                <p className="leise klein">{DOKART[d.art]}</p>
                <UnterschriftFeld name={`bild-${d.id}`} beschriftung="Unterschrift Auftraggeber" />
              </section>
            ))}

            {a.monatlich > 0 ? (
              <section className="karte" id="mandat">
                <h2>SEPA-Lastschriftmandat für die Monatsbeiträge</h2>
                <p className="leise klein">Damit ziehen wir den Monatsbeitrag ein; jeden Einzug kündigen wir {VORABANKUENDIGUNG_TAGE} Tage vorher an. Ihre Bank erstattet eine Lastschrift auf Wunsch binnen {ERSTATTUNG_WOCHEN} Wochen. Ohne IBAN bleibt das Mandat offen und kann später im Kundenportal erteilt werden.</p>
                {mandat ? <p className="hinweis ok">Mandat liegt schon vor: {mandat.daten.nummer}, Konto {ibanMaskiert(mandat.daten.konto.iban)}.</p> : (
                  <>
                    <div className="raster drei">
                      <label className="feld"><span>Kontoinhaber</span><input name="kontoinhaber" autoComplete="off" defaultValue={b.name} /></label>
                      <label className="feld"><span>IBAN</span><input name="iban" autoComplete="off" inputMode="text" spellCheck={false} placeholder="DE.. .... .... .... .... .." pattern="[A-Za-z]{2}[0-9]{2}[A-Za-z0-9 ]{11,40}" /></label>
                      <label className="feld"><span>BIC (freiwillig)</span><input name="bic" autoComplete="off" spellCheck={false} /></label>
                    </div>
                    <UnterschriftFeld name="mandatBild" beschriftung="Unterschrift Kontoinhaber bzw. Vertretung" />
                  </>
                )}
              </section>
            ) : null}

            <section className="karte">
              <h2>Wer unterschreibt?</h2>
              <div className="raster zwei">
                <label className="feld"><span>Vollständiger Name</span><input name="name" autoComplete="off" required minLength={3} defaultValue={b.inhaber ?? ""} /></label>
                <label className="feld"><span>Funktion</span><input name="funktion" placeholder="z. B. Inhaber, Geschäftsführer" /></label>
              </div>
              <label className="haken">
                <input type="checkbox" name="unternehmer" value="ja" required />
                <span>Ich erteile den Auftrag für {b.name} und handle nicht als Verbraucher (§ 14 BGB). Es gelten die AGB für Unternehmer, Version {AGB_VERSION} (<span className="mono">{AGB_URL}</span>).</span>
              </label>
            </section>

            <section className="karte">
              <h2>Für Levarex</h2>
              <label className="feld"><span>Name</span><input name="levarexName" required defaultValue={ich.name} /></label>
              <UnterschriftFeld name="levarexBild" beschriftung="Unterschrift Levarex (Geschäftsführer)" />
            </section>

            <UnterschriftPruefung formId="vertrag-form" />
            <button className="knopf haupt" style={{ width: "100%" }}>Verbindlich unterschreiben</button>
            <p className="leise klein">Danach erstellt Levarex OS die Auftragsbestätigung mit allen unterschriebenen Unterlagen. Sie geht nach Freigabe per E-Mail an {b.email ?? "den Kunden"} und liegt im Kundenportal.</p>
          </form>
        )}
      </main>
    </div>
  );
}
