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
import { erlaubt, GRENZEN, versuchMerken } from "@/lib/sicherheit";
import { kontingent, ticketAnlegen, ticketNummer, TICKET_STATUS } from "@/lib/ablauf/tickets";

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

async function aenderungWuenschen(f: FormData) {
  "use server";
  const token = String(f.get("token"));
  const b = await betriebPerPortal(token);
  if (!b) notFound();
  if (!(await erlaubt("formular", `portal:${b.id}`, GRENZEN.formularJeIp))) redirect(`/portal/k/${token}?ticketfehler=1#wunsch`);
  await versuchMerken("formular", `portal:${b.id}`);
  try {
    await ticketAnlegen({ betriebId: b.id, betreff: String(f.get("betreff") ?? ""), beschreibung: String(f.get("beschreibung") ?? ""), kategorie: String(f.get("kategorie") ?? "aenderung"), prioritaet: f.get("dringend") === "ja" ? "dringend" : "normal", quelle: "portal" }, `Kunde (Portal)`);
  } catch {
    redirect(`/portal/k/${token}?ticketfehler=1#wunsch`);
  }
  redirect(`/portal/k/${token}?ticket=1#wunsch`);
}

export default async function Kundenportal({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ fehler?: string; danke?: string; bezahlt?: string; abgebrochen?: string; abnahme?: string; abnahmefehler?: string; ticket?: string; ticketfehler?: string }> }) {
  const { token } = await params;
  const b = await betriebPerPortal(token);
  if (!b) notFound();
  const d = await portalDaten(b.id);
  const { fehler, danke, bezahlt, abgebrochen, abnahme, abnahmefehler, ticket, ticketfehler } = await searchParams;
  const mitBetreuung = d.projekt && ["live", "bereit", "bau", "pruefung"].includes(d.projekt.status);
  const k = mitBetreuung ? await kontingent(b.id) : null;
  const naechster = d.schritte.findIndex((s) => !s.erledigt);
  const offeneRechnungen = d.rechnungen.filter((r) => r.status === "offen");
  const erledigt = d.schritte.filter((s) => s.erledigt).length;
  const prozent = d.schritte.length ? Math.round((erledigt / d.schritte.length) * 100) : 0;
  const stunde = Number(new Date().toLocaleString("de-DE", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Berlin" }));
  const gruss = stunde < 11 ? "Guten Morgen" : stunde < 18 ? "Guten Tag" : "Guten Abend";
  // Der wichtigste offene Schritt für den Kunden: zuerst, was er tun muss, sonst unser nächster Schritt
  const handlung = d.angebotOffen
    ? { was: "Angebot ansehen und annehmen", href: "#angebot", knopf: "Zum Angebot" }
    : d.anzahlungOffen
      ? { was: "Anzahlung bezahlen", href: `/portal/k/${token}/zahlen`, knopf: "Jetzt bezahlen" }
      : d.inhalteOffen
        ? { was: "Texte und Fotos hochladen", href: `/portal/${d.inhalteOffen.portalToken}`, knopf: "Inhalte hochladen" }
        : d.abnahmeOffen
          ? { was: `Website prüfen und abnehmen, bitte bis ${tag(d.abnahmeOffen.abnahmeFrist)}`, href: "#abnahme", knopf: "Zur Abnahme" }
          : null;

  return (
    <>
      <section className="portal-held" aria-labelledby="betrieb-name">
        <div>
          <p className="gruss">{gruss}</p>
          <h1 id="betrieb-name">{b.name}</h1>
        </div>
        <div className="stand">
          <div className="stand-zeile"><span>Stand Ihres Projekts</span><b>{erledigt} von {d.schritte.length} Schritten</b></div>
          <div className="portal-balken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={prozent} aria-label="Fortschritt"><span style={{ width: `${prozent}%` }} /></div>
        </div>
        <div className="portal-naechstes">
          <div>
            <div className="etikett">{handlung ? "Jetzt für Sie" : "Als Nächstes bei uns"}</div>
            <div className="was">{handlung ? handlung.was : naechster >= 0 ? d.schritte[naechster].titel : "Alles erledigt. Wir kümmern uns um Ihre Website."}</div>
          </div>
          {handlung ? <a className="knopf haupt" href={handlung.href}>{handlung.knopf}</a> : null}
        </div>
      </section>
      {danke ? <div className="hinweis ok" role="status">Vielen Dank. Ihr Angebot ist angenommen. Die Rechnung über die Anzahlung bekommen Sie in Kürze.</div> : null}
      {bezahlt ? <div className="hinweis ok" role="status">Vielen Dank für Ihre Zahlung. Die Rechnung kommt per E-Mail, und wir melden uns mit den nächsten Schritten.</div> : null}
      {abnahme ? <div className="hinweis ok" role="status">{abnahme === "verweigert" ? "Danke für Ihre Rückmeldung. Wir beheben die Mängel und melden uns." : "Vielen Dank für die Abnahme. Das Protokoll bekommen Sie per E-Mail."}</div> : null}
      {abgebrochen ? <div className="hinweis" role="status">Die Zahlung wurde abgebrochen. Sie können sie jederzeit hier fortsetzen.</div> : null}

      {[d.angebotOffen, d.anzahlungOffen, d.inhalteOffen, d.abnahmeOffen].filter(Boolean).length + offeneRechnungen.length > 1 ? (
        <section className="karte">
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

      <section className="karte">
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
        <section className="karte">
          <h2>Ihre Website</h2>
          <p>Ihre Seite ist live{d.website.domain ? <> unter <b className="mono">{d.website.domain}</b></> : null}.</p>
          <a className="knopf" href={d.website.url} target="_blank">Website öffnen</a>
        </section>
      ) : null}

      {d.angebotOffen ? (
        <form id="angebot" action={annehmen} className="karte">
          <h2>Angebot annehmen</h2>
          {fehler ? <div className="hinweis fehler" role="alert">Bitte Ihren Namen eintragen und beide Häkchen setzen.</div> : null}
          <p>{PAKETE[d.angebotOffen.paket as PaketKey]?.name ?? "Webauftritt"}{d.angebotOffen.module.length ? " mit Modulen" : ""}: {euro(d.angebotOffen.einmalig)} netto einmalig und {euro(d.angebotOffen.monatlich)} netto Monatsbeitrag, Laufzeit 24 Monate ab Livegang. Alle Details stehen im Angebot bei Ihren Unterlagen.</p>
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
        <form id="abnahme" action={abnehmen} className="karte">
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
        <section className="karte">
          <h2>Anfragen über Ihre Website</h2>
          <ul className="liste">
            {d.anfragen.map((a) => (
              <li key={a.id}><div><div className="titel">{a.name} · <span className="mono">{a.kontakt}</span></div><div className="unter">{tag(a.am)} · {a.nachricht.slice(0, 220)}{a.nachricht.length > 220 ? " …" : ""}{a.dateien.length ? ` · ${a.dateien.length} Foto${a.dateien.length > 1 ? "s" : ""}` : ""}</div></div></li>
            ))}
          </ul>
        </section>
      ) : null}

      {mitBetreuung ? (
        <section id="wunsch" className="karte">
          <h2>Änderung oder Frage</h2>
          {ticket ? <div className="hinweis ok" role="status">Danke, ist angekommen. Wir melden uns, sobald es erledigt ist.</div> : null}
          {ticketfehler ? <div className="hinweis fehler" role="alert">Bitte Betreff und eine kurze Beschreibung eintragen.</div> : null}
          {k && k.enthalten ? <p className="leise klein">In Ihrer Betreuung sind {k.enthalten} Minuten Änderungen im Monat enthalten. Diesen Monat genutzt: {k.verbraucht} Minuten.</p> : null}
          <form action={aenderungWuenschen}>
            <input type="hidden" name="token" value={token} />
            <div className="raster zwei">
              <label className="feld"><span>Worum geht es?</span><input name="betreff" required placeholder="z. B. Neue Öffnungszeiten" /></label>
              <label className="feld"><span>Art</span><select name="kategorie" defaultValue="aenderung"><option value="aenderung">Änderung an der Website</option><option value="fehler">Etwas funktioniert nicht</option><option value="frage">Frage</option><option value="wunsch">Neuer Wunsch</option></select></label>
            </div>
            <label className="feld"><span>Beschreibung</span><textarea name="beschreibung" rows={3} required placeholder="Was soll sich ändern? Auf welcher Seite?" /></label>
            <label className="haken" style={{ marginBottom: 12 }}><input type="checkbox" name="dringend" value="ja" /><span>Dringend (z. B. Seite nicht erreichbar)</span></label>
            <button className="knopf">Absenden</button>
          </form>
          {d.tickets.length ? (
            <ul className="liste" style={{ marginTop: 12 }}>
              {d.tickets.map((t) => <li key={t.id}><div><div className="titel">{ticketNummer(t.id)} {t.betreff}</div><div className="unter">{tag(t.erstelltAm)}{t.erledigtAm ? ` · erledigt ${tag(t.erledigtAm)}` : ""}</div></div><span className={`status ${t.status === "erledigt" ? "ok" : "warten"}`}>{TICKET_STATUS[t.status]}</span></li>)}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="karte">
        <h2>Ihre Unterlagen</h2>
        {d.dokumente.length ? (
          <div className="portal-kacheln">
            {d.dokumente.map((x) => (
              <a key={x.id} className="portal-kachel" href={`/portal/k/${token}/dokument/${x.id}`} target="_blank">
                <span className="symbol" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
                </span>
                <span><span className="titel" style={{ display: "block" }}>{DOKART[x.art] ?? x.art}</span><span className="unter" style={{ display: "block" }}>{tag(x.versendetAm)} · PDF öffnen</span></span>
              </a>
            ))}
          </div>
        ) : <p className="leise">Hier erscheinen Protokoll, Angebot und weitere Unterlagen, sobald wir sie Ihnen geschickt haben.</p>}
      </section>

      <section className="karte">
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

      <section className="karte">
        <h2>Ihre Ansprechpartner</h2>
        <div className="portal-personen">
          {[["DL", "Daniel Lück", "Beratung und Angebot"], ["MS", "Maximilian Steiner", "Website und Technik"]].map(([k, n, r]) => (
            <div key={n} className="portal-person"><span className="initialen" aria-hidden="true">{k}</span><div><div style={{ fontWeight: 600 }}>{n}</div><div className="leise klein">{r}</div></div></div>
          ))}
        </div>
        <p style={{ marginTop: 16 }}>Tel. <a href={`tel:${marke.absender.telefon.replace(/\s/g, "")}`}>{marke.absender.telefon}</a> · <a href={`mailto:${marke.absender.email}`}>{marke.absender.email}</a></p>
        <p className="leise klein">Dieser Link ist nur für Sie. Bitte nicht weitergeben.</p>
      </section>
    </>
  );
}
