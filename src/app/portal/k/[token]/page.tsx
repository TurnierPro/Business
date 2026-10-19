import { notFound, redirect } from "next/navigation";
import { betriebPerPortal, portalDaten } from "@/lib/kundenportal";
import { unterschriftEingegangen } from "@/lib/ablauf/verkauf";
import { PAKETE, PaketKey, euro, UST } from "@/lib/pakete";
import { marke } from "@/lib/marke";
import { DOKART } from "@/lib/format";
import { zahlungUeberStripe } from "@/lib/adapters/stripe";
import { anzahlungsLink } from "@/lib/ablauf/zahlung";
import { abnahmeErklaeren } from "@/lib/ablauf/vertrag";
import { AGB_URL, AGB_VERSION } from "@/lib/recht";

export const metadata = { title: "Ihr Kundenportal", robots: { index: false } };

const tag = (d: Date | null) => (d ? new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }) : "");

async function annehmen(f: FormData) {
  "use server";
  const token = String(f.get("token"));
  const b = await betriebPerPortal(token);
  if (!b) notFound();
  const daten = await portalDaten(b.id);
  const name = String(f.get("name") ?? "").trim();
  if (!daten.angebotOffen || !name || f.get("zustimmung") !== "ja" || f.get("unternehmer") !== "ja") redirect(`/portal/k/${token}?fehler=1#angebot`);
  // Nachweis: Name, Zeitpunkt, AGB-Version, Unternehmer bestätigt
  await unterschriftEingegangen(daten.angebotOffen.id, `Kunde: ${name} (Annahme im Kundenportal)`, { name, am: new Date().toISOString(), agbVersion: AGB_VERSION, unternehmer: true });
  // Mit Stripe geht es direkt weiter zur Zahlseite für die Anzahlung
  redirect(zahlungUeberStripe() ? await anzahlungsLink(daten.angebotOffen.id) : `/portal/k/${token}?danke=1`);
}

async function abnehmen(f: FormData) {
  "use server";
  const token = String(f.get("token"));
  const b = await betriebPerPortal(token);
  if (!b) notFound();
  const daten = await portalDaten(b.id);
  const ergebnis = String(f.get("ergebnis"));
  if (!daten.abnahmeOffen || !["abgenommen", "vorbehalt", "verweigert"].includes(ergebnis)) redirect(`/portal/k/${token}?abnahmefehler=1#abnahme`);
  try {
    await abnahmeErklaeren(daten.abnahmeOffen.id, { ergebnis: ergebnis as "abgenommen", name: String(f.get("name") ?? ""), maengel: String(f.get("maengel") ?? "") });
  } catch {
    redirect(`/portal/k/${token}?abnahmefehler=1#abnahme`);
  }
  redirect(`/portal/k/${token}?abnahme=${ergebnis}`);
}

export default async function Kundenportal({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ fehler?: string; danke?: string; bezahlt?: string; abgebrochen?: string; abnahme?: string; abnahmefehler?: string }> }) {
  const { token } = await params;
  const b = await betriebPerPortal(token);
  if (!b) notFound();
  const d = await portalDaten(b.id);
  const { fehler, danke, bezahlt, abgebrochen, abnahme, abnahmefehler } = await searchParams;
  const naechster = d.schritte.findIndex((s) => !s.erledigt);
  const offeneRechnungen = d.rechnungen.filter((r) => r.status === "offen");

  return (
    <>
      <h1>{b.name}</h1>
      <p className="leise" style={{ marginTop: 8 }}>Ihr Kundenportal bei Stelax. Hier sehen Sie, wo Ihr Projekt steht, und finden alle Unterlagen.</p>
      {danke ? <div className="hinweis ok abstand" role="status">Vielen Dank. Ihr Angebot ist angenommen. Die Rechnung über die Anzahlung bekommen Sie in Kürze.</div> : null}
      {bezahlt ? <div className="hinweis ok abstand" role="status">Vielen Dank für Ihre Zahlung. Die Rechnung kommt per E-Mail, und wir melden uns mit den nächsten Schritten.</div> : null}
      {abnahme ? <div className="hinweis ok abstand" role="status">{abnahme === "verweigert" ? "Danke für Ihre Rückmeldung. Wir beheben die Mängel und melden uns." : "Vielen Dank für die Abnahme. Das Protokoll bekommen Sie per E-Mail."}</div> : null}
      {abgebrochen ? <div className="hinweis abstand" role="status">Die Zahlung wurde abgebrochen. Sie können sie jederzeit hier fortsetzen.</div> : null}

      {d.angebotOffen || d.anzahlungOffen || d.inhalteOffen || d.abnahmeOffen || offeneRechnungen.length ? (
        <section className="karte abstand">
          <h2>Was wir gerade von Ihnen brauchen</h2>
          <ul className="liste">
            {d.angebotOffen ? <li><div><div className="titel">Angebot ansehen und annehmen</div><div className="unter">{PAKETE[d.angebotOffen.paket as PaketKey].name}</div></div><a className="knopf klein" href="#angebot">Zum Angebot</a></li> : null}
            {d.anzahlungOffen ? <li><div><div className="titel">Anzahlung bezahlen</div><div className="unter">{euro(Math.round((d.anzahlungOffen.einmalig / 2) * (1 + UST)))} brutto, online per Karte oder SEPA-Lastschrift</div></div><a className="knopf haupt klein" href={`/portal/k/${token}/zahlen`}>Jetzt bezahlen</a></li> : null}
            {d.inhalteOffen ? <li><div><div className="titel">Texte und Fotos hochladen</div><div className="unter">Damit wir Ihre Seite bauen können</div></div><a className="knopf haupt klein" href={`/portal/${d.inhalteOffen.portalToken}`}>Inhalte hochladen</a></li> : null}
            {d.abnahmeOffen ? <li><div><div className="titel">Website prüfen und abnehmen</div><div className="unter">Bitte bis {tag(d.abnahmeOffen.abnahmeFrist)}</div></div><a className="knopf klein" href="#abnahme">Zur Abnahme</a></li> : null}
            {offeneRechnungen.map((r) => <li key={r.id}><div><div className="titel">Rechnung {r.nummer} begleichen</div><div className="unter">{euro(Math.round(r.netto * (1 + UST)))} brutto{r.faelligAm ? `, zahlbar bis ${tag(r.faelligAm)}` : ""}, Verwendungszweck {r.nummer}</div></div>{r.dokumentId ? <a className="knopf klein" href={`/portal/k/${token}/dokument/${r.dokumentId}`} target="_blank">Rechnung</a> : null}</li>)}
          </ul>
        </section>
      ) : null}

      <section className="karte abstand">
        <h2>So weit sind wir</h2>
        <ol className="fortschritt">
          {d.schritte.map((s, i) => (
            <li key={s.titel} className={s.erledigt ? "erledigt" : i === naechster ? "aktuell" : ""}>
              <span className="punkt" aria-hidden="true">{s.erledigt ? "✓" : i + 1}</span>
              <div>
                <div className="titel">{s.titel}{s.erledigt ? <span className="sr-only"> (erledigt)</span> : i === naechster ? <span className="leise klein"> · als Nächstes</span> : null}</div>
                <div className="unter">{s.text}{s.datum ? ` · ${tag(s.datum)}` : ""}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {d.website ? (
        <section className="karte abstand">
          <h2>Ihre Website</h2>
          <p>Ihre Seite ist live{d.website.domain ? <> unter <b className="mono">{d.website.domain}</b></> : null}.</p>
          <a className="knopf" href={d.website.url} target="_blank">Website öffnen</a>
        </section>
      ) : null}

      {d.angebotOffen ? (
        <form id="angebot" action={annehmen} className="karte abstand">
          <h2>Angebot annehmen</h2>
          {fehler ? <div className="hinweis fehler" role="alert">Bitte Ihren Namen eintragen und beide Häkchen setzen.</div> : null}
          <p>{PAKETE[d.angebotOffen.paket as PaketKey].name}: {euro(d.angebotOffen.einmalig)} netto einmalig, {euro(d.angebotOffen.monatlich)} netto im Monat für die Betreuung (12 Monate Mindestlaufzeit). Alle Details stehen im Angebot unten bei Ihren Unterlagen.</p>
          <input type="hidden" name="token" value={token} />
          <label className="feld"><span>Ihr vollständiger Name</span><input name="name" autoComplete="name" required /></label>
          <label className="haken" style={{ marginBottom: 12 }}>
            <input type="checkbox" name="zustimmung" value="ja" required />
            <span>Ich nehme das Angebot im Namen von {b.name} verbindlich an.</span>
          </label>
          <label className="haken" style={{ marginBottom: 16 }}>
            <input type="checkbox" name="unternehmer" value="ja" required />
            <span>Ich handle für den Betrieb, nicht als Verbraucher (§ 14 BGB). Es gelten die <a href={AGB_URL} target="_blank">AGB für Unternehmer</a>, Version {AGB_VERSION}.</span>
          </label>
          <button className="knopf haupt">Verbindlich annehmen</button>
        </form>
      ) : null}

      {d.abnahmeOffen ? (
        <form id="abnahme" action={abnehmen} className="karte abstand">
          <h2>Website abnehmen</h2>
          {abnahmefehler ? <div className="hinweis fehler" role="alert">Bitte Ihren Namen eintragen und bei Mängeln kurz beschreiben, was nicht passt.</div> : null}
          <p>Bitte prüfen Sie Ihre Website{d.projekt?.domain ? <> unter <b className="mono">{d.projekt.domain}</b></> : null} bis zum <b>{tag(d.abnahmeOffen.abnahmeFrist)}</b>. Erklären Sie bis dahin nichts und nennen keinen Mangel, gilt die Website als abgenommen (§ 640 Abs. 2 BGB).</p>
          <input type="hidden" name="token" value={token} />
          <fieldset className="feld" style={{ border: 0, padding: 0 }}>
            <legend style={{ fontWeight: 600, marginBottom: 8 }}>Ihre Erklärung</legend>
            <label className="haken"><input type="radio" name="ergebnis" value="abgenommen" required /><span>Abgenommen. Alles passt.</span></label>
            <label className="haken"><input type="radio" name="ergebnis" value="vorbehalt" /><span>Abgenommen unter Vorbehalt dieser Mängel</span></label>
            <label className="haken"><input type="radio" name="ergebnis" value="verweigert" /><span>Nicht abgenommen wegen dieser Mängel</span></label>
          </fieldset>
          <label className="feld"><span>Mängel</span><textarea name="maengel" rows={3} placeholder="Nur bei Vorbehalt oder Verweigerung: Was passt nicht? Auf welcher Seite?" /></label>
          <label className="feld"><span>Ihr vollständiger Name</span><input name="name" autoComplete="name" required /></label>
          <button className="knopf haupt">Erklärung abschicken</button>
        </form>
      ) : null}

      {d.anfragen.length ? (
        <section className="karte abstand">
          <h2>Anfragen über Ihre Website</h2>
          <ul className="liste">
            {d.anfragen.map((a) => (
              <li key={a.id}><div><div className="titel">{a.name} · <span className="mono">{a.kontakt}</span></div><div className="unter">{tag(a.am)} · {a.nachricht.slice(0, 220)}{a.nachricht.length > 220 ? " …" : ""}{a.dateien.length ? ` · ${a.dateien.length} Foto${a.dateien.length > 1 ? "s" : ""}` : ""}</div></div></li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="karte abstand">
        <h2>Ihre Unterlagen</h2>
        {d.dokumente.length ? (
          <ul className="liste">
            {d.dokumente.map((x) => <li key={x.id}><div><div className="titel">{DOKART[x.art] ?? x.art}</div><div className="unter">{x.titel} · {tag(x.versendetAm)}</div></div><a className="knopf klein" href={`/portal/k/${token}/dokument/${x.id}`} target="_blank">PDF</a></li>)}
          </ul>
        ) : <p className="leise">Hier erscheinen Protokoll, Angebot und weitere Unterlagen, sobald wir sie Ihnen geschickt haben.</p>}
      </section>

      <section className="karte abstand">
        <h2>Rechnungen</h2>
        {d.rechnungen.length ? (
          <table className="tabelle">
            <thead><tr><th>Nummer</th><th className="weg-mobil">Datum</th><th className="zahl">Betrag</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {d.rechnungen.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.nummer}<div className="leise klein">{r.art === "anzahlung" ? "Anzahlung" : r.art === "schluss" ? "Schlussrechnung" : "Betreuung"}</div></td>
                  <td className="weg-mobil mono klein">{tag(r.erstelltAm)}</td>
                  <td className="zahl">{euro(Math.round(r.netto * (1 + UST)))}</td>
                  <td><span className={`status ${r.status === "bezahlt" ? "ok" : "warten"}`}>{r.status === "bezahlt" ? "bezahlt" : "offen"}</span></td>
                  <td>{r.stripeUrl ? <a className="klein" href={r.stripeUrl} target="_blank">Rechnung</a> : r.dokumentId ? <a className="klein" href={`/portal/k/${token}/dokument/${r.dokumentId}`} target="_blank">PDF</a> : r.quelle === "stripe" ? <span className="leise klein">per E-Mail</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="leise">Noch keine Rechnungen.</p>}
      </section>

      <section className="karte abstand">
        <h2>Ihre Ansprechpartner</h2>
        <p>Daniel Lück (Beratung) und Max Steiner (Technik)<br />Tel. <a href={`tel:${marke.absender.telefon.replace(/\s/g, "")}`}>{marke.absender.telefon}</a> · <a href={`mailto:${marke.absender.email}`}>{marke.absender.email}</a></p>
        <p className="leise klein">Dieser Link ist nur für Sie. Bitte nicht weitergeben.</p>
      </section>
    </>
  );
}
