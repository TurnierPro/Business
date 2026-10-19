import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { Status } from "@/components/Status";
import { datum } from "@/lib/format";
import { basisUrl } from "@/lib/ablauf/gemeinsam";
import { PAKETE, PaketKey } from "@/lib/pakete";
import { abnahmeErneut, kuendigungErfassen, neuBauen, providerwechselErledigt, umzugPruefen } from "../../aktionen";
import { umzugVon } from "@/lib/ablauf/umzug";
import { bfsgHinweis } from "@/lib/ablauf/lieferung";

const SCHRITTE = [
  { key: "inhalte", text: "Inhalte vom Kunden" },
  { key: "bau", text: "Bau" },
  { key: "pruefung", text: "Prüfung" },
  { key: "bereit", text: "Freigabe Livegang" },
  { key: "live", text: "Live" },
  { key: "abnahme", text: "Abnahme" },
];

const ABNAHME: Record<string, string> = { offen: "wartet auf Abnahme", abgenommen: "abgenommen", vorbehalt: "abgenommen mit Mängeln", verweigert: "Abnahme verweigert", fiktion: "abgenommen (Frist abgelaufen)" };

export default async function Projekt({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = await getDb();
  const [p] = await db.select().from(schema.projekte).where(eq(schema.projekte.id, id));
  if (!p) notFound();
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, p.betriebId));
  const [seite] = p.seitenSlug ? await db.select().from(schema.seiten).where(eq(schema.seiten.slug, p.seitenSlug)) : [];
  const livegang = (await db.select().from(schema.postausgang).where(eq(schema.postausgang.projektId, id))).find((e) => e.zweck === "livegang" && e.status === "zur_freigabe");
  const abgenommen = ["abgenommen", "vorbehalt", "fiktion"].includes(p.abnahmeStatus ?? "");
  const index = abgenommen ? SCHRITTE.length : p.status === "live" ? 5 : SCHRITTE.findIndex((s) => s.key === p.status);
  const bfsg = bfsgHinweis(p.onboarding);
  const umzug = umzugVon(p);
  const UMZUG: Record<string, string> = { geprueft: "geprüft, Umstellung beim Livegang", providerwechsel: "Providerwechsel durch Stelax offen", wartet_dns: "wartet auf Umstellung beim Kunden", umgestellt: "umgestellt" };
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
          {p.abnahmeStatus ? (
            <div style={{ marginTop: 12 }}>
              <p><b>Abnahme:</b> <Status wert={p.abnahmeStatus === "offen" ? "wartet" : p.abnahmeStatus} /> {ABNAHME[p.abnahmeStatus]}{p.abnahmeFrist && p.abnahmeStatus === "offen" ? `, Frist bis ${datum(p.abnahmeFrist)}` : p.abnahmeStatus === "offen" ? ", Aufforderung wartet auf Freigabe" : ""}{p.abnahmeAm ? ` am ${datum(p.abnahmeAm)}` : ""}{p.abnahmeName ? ` von ${p.abnahmeName}` : ""}</p>
              {p.abnahmeMaengel ? <div className="hinweis">Mängel: {p.abnahmeMaengel}</div> : null}
              {p.abnahmeStatus === "verweigert" ? <form action={abnahmeErneut}><input type="hidden" name="id" value={id} /><button className="knopf">Mängel behoben: erneut zur Abnahme vorlegen</button></form> : null}
            </div>
          ) : null}
          {p.gekuendigtAm ? <p className="hinweis" style={{ marginTop: 12 }}>Gekündigt am {datum(p.gekuendigtAm)}, Ende {datum(p.endeAm)}.</p> : null}
          {p.status === "beendet" ? <p>Vertrag beendet am {datum(p.endeAm)}.</p> : null}
          {seite ? <p style={{ marginTop: 16 }}><a className="knopf klein" target="_blank" href={`/vorschau/${seite.slug}${seite.zugangscode ? `?code=${seite.zugangscode}` : ""}`}>Seite ansehen</a></p> : null}
        </section>

        <section className="karte">
          {bfsg ? <div className="hinweis" style={{ marginBottom: 16 }}>{bfsg}</div> : null}
          {Object.keys(p.onboarding).length ? <p className="leise klein">Onboarding: {p.onboarding.mitarbeiter} Mitarbeitende · Umsatz {p.onboarding.umsatz === "ueber2" ? "über" : "bis"} 2 Mio. € · Verbraucherfunktion: {p.onboarding.verbraucher === "nein" ? "keine" : p.onboarding.verbraucher === "termin" ? "Terminbuchung" : "Bestellung/Vertrag"}</p> : null}
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

      {umzug ? (
        <section className="karte abstand">
          <div className="kopfzeile" style={{ marginBottom: 8 }}>
            <div><h2 style={{ margin: 0 }}>Domain-Umzug: <span className="mono">{umzug.domain}</span></h2>
              <p className="leise klein">{umzug.weg === "uebernehmen" ? "Weg B: Stelax übernimmt die Domain-Verwaltung (AuthInfo)" : "Weg A: Kunde ändert A-Einträge, Domain und E-Mail bleiben beim Anbieter"} · Auftrag vom {datum(umzug.vollmachtAm ? new Date(umzug.vollmachtAm) : null)}{umzug.rechteBestaetigt ? " · Rechte an Inhalten bestätigt" : ""}</p></div>
            <Status wert={umzug.status === "umgestellt" ? "fertig" : umzug.status ? "wartet" : "laeuft"} />
          </div>
          <p><b>Stand:</b> {umzug.status ? UMZUG[umzug.status] : "Bestandsaufnahme läuft"}{umzug.stand ? ` · Domain bei ${umzug.stand.dnsAnbieter ?? umzug.anbieterAngabe ?? "unbekannt"} · E-Mail bei ${umzug.stand.mailAnbieter ?? "keinem erkannten Dienst"}` : ""}{umzug.stand?.simuliert ? " · Simulator" : ""}</p>
          {umzug.letztePruefung ? <p className="leise klein">Letzte Prüfung {datum(new Date(umzug.letztePruefung.am))}: {umzug.letztePruefung.detail}</p> : null}
          {umzug.warnungen?.length ? <ul>{umzug.warnungen.map((w) => <li key={w}>{w}</li>)}</ul> : null}
          {umzug.stand ? (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer" }}>{umzug.stand.eintraege.length} DNS-Einträge (Bestandsaufnahme) · Nameserver {umzug.stand.nameserver.join(", ") || "–"}</summary>
              <table className="tabelle klein"><thead><tr><th>Typ</th><th>Name</th><th>Wert</th></tr></thead>
                <tbody>{umzug.stand.eintraege.map((e, i) => <tr key={i}><td className="mono">{e.typ}</td><td className="mono">{e.name}</td><td className="mono" style={{ wordBreak: "break-all" }}>{e.wert}</td></tr>)}</tbody></table>
            </details>
          ) : null}
          {umzug.alteSeiten?.length ? (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer" }}>{umzug.alteSeiten.length} alte Adressen mit Weiterleitung · {umzug.gesichert === 1 ? "1 Seite" : `${umzug.gesichert ?? 0} Seiten`} der alten Website gesichert</summary>
              <ul className="klein mono">{umzug.alteSeiten.map((a) => <li key={a.pfad}>{a.pfad} → /{a.ziel}</li>)}</ul>
            </details>
          ) : null}
          <div className="knopfreihe" style={{ marginTop: 12 }}>
            <form action={umzugPruefen}><input type="hidden" name="id" value={id} /><button className="knopf klein">Jetzt neu prüfen</button></form>
            {umzug.status === "providerwechsel" ? <form action={providerwechselErledigt}><input type="hidden" name="id" value={id} /><button className="knopf klein">Providerwechsel erledigt</button></form> : null}
          </div>
        </section>
      ) : null}

      {p.status === "live" && !p.gekuendigtAm ? (
        <details className="karte abstand">
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Kündigung der Betreuung erfassen</summary>
          <form action={kuendigungErfassen} style={{ marginTop: 12 }}>
            <input type="hidden" name="id" value={id} />
            <p className="leise">Stelax OS berechnet das Ende (12 Monate Mindestlaufzeit, danach zum Ende des Folgemonats; in den AGB prüfen), legt die Bestätigung in den Postausgang und beendet ein Stripe-Abo nach Freigabe.</p>
            <label className="feld"><span>Kündigung eingegangen am</span><input type="date" name="eingang" required defaultValue={new Date().toISOString().slice(0, 10)} style={{ maxWidth: 220 }} /></label>
            <button className="knopf">Kündigung erfassen</button>
          </form>
        </details>
      ) : null}
    </>
  );
}
