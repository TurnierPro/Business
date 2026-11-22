import { notFound, redirect } from "next/navigation";
import { betriebPerPortal, portalDaten, zugangPerPortal } from "@/lib/kundenportal";
import { demoDatei, demosVon } from "@/lib/demos";
import { PAKETE, PaketKey, euro, UST } from "@/lib/pakete";
import { MailSymbol, TelefonSymbol } from "@/components/Symbole";
import { marke } from "@/lib/marke";
import { DOKART } from "@/lib/format";
import { abnahmeErklaeren } from "@/lib/ablauf/vertrag";
import { kontingent, ticketNummer, TICKET_STATUS } from "@/lib/ablauf/tickets";
import { aktivesMandat, ibanMaskiert, mandatErteilen, mandatOffen } from "@/lib/ablauf/mandat";
import { ERSTATTUNG_WOCHEN, VORABANKUENDIGUNG_TAGE } from "@/lib/recht";
import { UnterschriftFeld } from "@/components/UnterschriftFeld";
import { headers } from "next/headers";
import { clientIp, erlaubt, GRENZEN, versuchMerken } from "@/lib/sicherheit";

export const metadata = { title: "Ihr Kundenportal", robots: { index: false } };

const tag = (d: Date | null) => (d ? new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }) : "");

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

// SEPA-Mandat selbst im Portal erteilen (wenn es beim Termin offen geblieben ist)
async function mandatErteilenPortal(f: FormData) {
  "use server";
  const token = String(f.get("token"));
  const zugang = await zugangPerPortal(token);
  if (!zugang) notFound();
  const b = zugang.betrieb;
  const ip = clientIp(await headers());
  if (!(await erlaubt("portal-mandat", ip, GRENZEN.formularJeIp))) redirect(`/portal/k/${token}?mandatfehler=${encodeURIComponent("Zu viele Versuche. Bitte in einer Stunde noch einmal.")}#mandat`);
  await versuchMerken("portal-mandat", ip);
  const offen = await mandatOffen(b.id);
  if (!offen) redirect(`/portal/k/${token}#mandat`);
  const feld = (k: string) => String(f.get(k) ?? "").trim();
  if (f.get("einverstanden") !== "ja") redirect(`/portal/k/${token}?mandatfehler=${encodeURIComponent("Bitte bestätigen Sie, dass Sie das Mandat erteilen.")}#mandat`);
  let fehler = "";
  try {
    await mandatErteilen({ betriebId: b.id, angebotId: offen.angebotId, kontoinhaber: feld("kontoinhaber"), iban: feld("iban"), bic: feld("bic"), name: feld("name"), bild: feld("mandatBild"), wer: `Kundenportal (${zugang.person ?? b.name})` });
  } catch (e) {
    fehler = e instanceof Error ? e.message : "Das hat nicht geklappt.";
  }
  if (fehler) redirect(`/portal/k/${token}?mandatfehler=${encodeURIComponent(fehler.slice(0, 200))}#mandat`);
  redirect(`/portal/k/${token}?mandat=1#mandat`);
}

export default async function Kundenportal({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ fehler?: string; danke?: string; bezahlt?: string; abgebrochen?: string; abnahme?: string; abnahmefehler?: string; ticket?: string; ticketfehler?: string; mandat?: string; mandatfehler?: string }> }) {
  const { token } = await params;
  const zugang = await zugangPerPortal(token);
  if (!zugang) notFound();
  const b = zugang.betrieb;
  const d = await portalDaten(b.id);
  // Demo-Pakete, die nach Freigabe ins Portal gestellt wurden
  const demoPakete = (await demosVon(b.id)).filter((x) => x.status === "im_portal");
  const { danke, bezahlt, abgebrochen, abnahme, abnahmefehler, mandat: mandatDanke, mandatfehler } = await searchParams;
  const [mandatFehlt, mandat] = await Promise.all([mandatOffen(b.id), aktivesMandat(b.id)]);
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
    ? { was: "Angebot ansehen; unterschrieben wird beim Termin", href: "#angebot", knopf: "Zum Angebot" }
    : d.anzahlungOffen
      ? { was: "Anzahlung bezahlen", href: `/portal/k/${token}/zahlen`, knopf: "Jetzt bezahlen" }
      : d.inhalteOffen
        ? { was: "Texte und Fotos hochladen", href: `/portal/${d.inhalteOffen.portalToken}`, knopf: "Inhalte hochladen" }
        : d.abnahmeOffen
          ? { was: `Website prüfen und abnehmen, bitte bis ${tag(d.abnahmeOffen.abnahmeFrist)}`, href: "#abnahme", knopf: "Zur Abnahme" }
          : mandatFehlt
            ? { was: "SEPA-Lastschriftmandat für den Monatsbeitrag erteilen", href: "#mandat", knopf: "Mandat erteilen" }
            : null;

  return (
    <>
      <section className="portal-held" aria-labelledby="betrieb-name">
        <div>
          <p className="gruss">{gruss}{zugang.person ? `, ${zugang.person}` : ""}</p>
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
        {d.lieferfrist ? <p className="leise klein" style={{ marginTop: 12 }}>Ihre Website ist spätestens am <b>{tag(d.lieferfrist)}</b> fertig zur Abnahme.</p> : null}
      </section>
      {d.mitwirkung.length ? (
        <section className="karte" aria-labelledby="mitwirkung">
          <h2 id="mitwirkung">Was wir von Ihnen brauchen</h2>
          <ul className="liste-schlicht">
            {d.mitwirkung.map((m) => (
              <li key={m.titel}><span className={`status ${m.erledigt ? "ok" : "warten"}`}>{m.erledigt ? "da" : "fehlt"}</span> {m.titel}{m.hinweis ? <span className="leise klein"> · {m.hinweis}</span> : null}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {danke ? <div className="hinweis ok" role="status">Vielen Dank. Ihr Angebot ist angenommen. Die Rechnung über die Anzahlung bekommen Sie in Kürze.</div> : null}
      {bezahlt ? <div className="hinweis ok" role="status">Vielen Dank für Ihre Zahlung. Die Rechnung kommt per E-Mail, und wir melden uns mit den nächsten Schritten.</div> : null}
      {abnahme ? <div className="hinweis ok" role="status">{abnahme === "verweigert" ? "Danke für Ihre Rückmeldung. Wir beheben die Mängel und melden uns." : "Vielen Dank für die Abnahme. Das Protokoll bekommen Sie per E-Mail."}</div> : null}
      {abgebrochen ? <div className="hinweis" role="status">Die Zahlung wurde abgebrochen. Sie können sie jederzeit hier fortsetzen.</div> : null}

      {[d.angebotOffen, d.anzahlungOffen, d.inhalteOffen, d.abnahmeOffen, mandatFehlt].filter(Boolean).length + offeneRechnungen.length > 1 ? (
        <section className="karte">
          <h2>Was wir gerade von Ihnen brauchen</h2>
          <ul className="liste">
            {d.angebotOffen ? <li><div><div className="titel">Angebot ansehen</div><div className="unter">{PAKETE[d.angebotOffen.paket as PaketKey].name}</div></div><a className="knopf klein" href="#angebot">Zum Angebot</a></li> : null}
            {d.anzahlungOffen ? <li><div><div className="titel">Anzahlung bezahlen</div><div className="unter">{euro(Math.round((d.anzahlungOffen.einmalig / 2) * (1 + UST)))} brutto, online per Karte oder SEPA-Lastschrift</div></div><a className="knopf haupt klein" href={`/portal/k/${token}/zahlen`}>Jetzt bezahlen</a></li> : null}
            {d.inhalteOffen ? <li><div><div className="titel">Texte und Fotos hochladen</div><div className="unter">Damit wir Ihre Seite bauen können</div></div><a className="knopf haupt klein" href={`/portal/${d.inhalteOffen.portalToken}`}>Inhalte hochladen</a></li> : null}
            {d.abnahmeOffen ? <li><div><div className="titel">Website prüfen und abnehmen</div><div className="unter">Bitte bis {tag(d.abnahmeOffen.abnahmeFrist)}</div></div><a className="knopf klein" href="#abnahme">Zur Abnahme</a></li> : null}
            {mandatFehlt ? <li><div><div className="titel">SEPA-Mandat erteilen</div><div className="unter">Für den Einzug des Monatsbeitrags</div></div><a className="knopf klein" href="#mandat">Zum Mandat</a></li> : null}
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

      {demoPakete.length ? (
        <section id="demo" className="karte">
          <h2>Ihre Demo</h2>
          <p>So könnte Ihr neuer Auftritt aussehen: Website und Instagram-Beiträge, gebaut aus Ihren Angaben. Jede Seite lässt sich anklicken. Die Demo ist nicht öffentlich.</p>
          {demoPakete.map((x) => (
            <div key={x.id} className="knopfreihe" style={{ marginTop: 12 }}>
              <a className="knopf" href={`/portal/k/${token}/demo/${x.id}/index.html`} target="_blank" rel="noopener">{demoPakete.length > 1 ? x.titel : "Demo ansehen"}</a>
              {demoDatei(x.id, ["instagram.html"]) ? <a className="klein" href={`/portal/k/${token}/demo/${x.id}/instagram.html`} target="_blank" rel="noopener">Instagram-Vorlagen</a> : null}
            </div>
          ))}
          <p className="leise klein" style={{ marginTop: 12 }}>Texte und Fotos prüfen wir vor dem Start gemeinsam mit Ihnen. Formulare senden in der Demo noch nichts.</p>
        </section>
      ) : null}

      {d.angebotOffen ? (
        <section id="angebot" className="karte">
          <h2>Ihr Angebot</h2>
          <p>{PAKETE[d.angebotOffen.paket as PaketKey]?.name ?? "Webauftritt"}{d.angebotOffen.module.length ? " mit Modulen" : ""}: {euro(d.angebotOffen.einmalig)} netto einmalig und {euro(d.angebotOffen.monatlich)} netto Monatsbeitrag, Laufzeit 24 Monate ab Livegang. Alle Details stehen im Angebot bei Ihren Unterlagen.</p>
          <p className="leise">Unterschrieben wird beim Termin mit Daniel Lück: Er bringt die Verträge auf dem Tablet mit. Fragen vorab? Rufen Sie uns an.</p>
        </section>
      ) : null}

      {d.abnahmeOffen ? (
        <form id="abnahme" action={abnehmen} className="karte">
          <h2>Website abnehmen</h2>
          {abnahmefehler ? <div className="hinweis fehler" role="alert">Bitte Ihren Namen eintragen und bei Mängeln kurz beschreiben, was nicht passt.</div> : null}
          <p>Bitte prüfen Sie Ihre Website bis zum <b>{tag(d.abnahmeOffen.abnahmeFrist)}</b>, am Handy und am Computer. Erklären Sie bis dahin nichts und nennen keinen Mangel, gilt die Website als abgenommen (§ 640 Abs. 2 BGB). Online{d.projekt?.domain ? <> unter <b className="mono">{d.projekt.domain}</b></> : null} geht sie erst nach Ihrer Abnahme.</p>
          {d.vorschau ? <p><a className="knopf" href={d.vorschau} target="_blank" rel="noopener noreferrer">Vorschau öffnen</a></p> : null}
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
          <p>Schreiben Sie uns einfach eine E-Mail an <a href={`mailto:${marke.absender.email}`}>{marke.absender.email}</a> oder rufen Sie an: <a href={`tel:${marke.absender.telefon.replace(/\s/g, "")}`}>{marke.absender.telefon}</a>. Wir melden uns und tragen den Stand hier ein.</p>
          {k && k.enthalten ? <p className="leise klein">In Ihrem Monatsbeitrag sind {k.enthalten} Minuten Änderungen im Monat enthalten. Diesen Monat genutzt: {k.verbraucht} Minuten.</p> : null}
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

      {mandatFehlt || mandat || mandatDanke ? (
        <section id="mandat" className="karte">
          <h2>SEPA-Lastschriftmandat</h2>
          {mandatDanke ? <div className="hinweis ok" role="status">Vielen Dank. Ihr Mandat ist gespeichert und liegt bei Ihren Unterlagen.</div> : null}
          {mandatfehler ? <div className="hinweis fehler" role="alert">{mandatfehler}</div> : null}
          {mandat ? (
            <p>Erteilt am {tag(new Date(mandat.daten.unterschriften?.[0]?.am ?? mandat.erstelltAm))} für das Konto <b className="mono">{ibanMaskiert(mandat.daten.konto.iban)}</b>, Mandatsreferenz <span className="mono">{mandat.daten.nummer}</span>. Möchten Sie das Konto ändern? Schreiben Sie uns unten unter „Änderung oder Frage“.</p>
          ) : mandatFehlt ? (
            <form action={mandatErteilenPortal} style={{ display: "grid", gap: 12 }}>
              <input type="hidden" name="token" value={token} />
              <p className="leise">Damit ziehen wir Ihren Monatsbeitrag ein. Jeden Einzug kündigen wir {VORABANKUENDIGUNG_TAGE} Tage vorher mit Betrag und Datum an. Ihre Bank erstattet eine Lastschrift auf Wunsch binnen {ERSTATTUNG_WOCHEN} Wochen.</p>
              <div className="raster drei">
                <label className="feld"><span>Kontoinhaber</span><input name="kontoinhaber" required minLength={3} autoComplete="off" defaultValue={b.name} /></label>
                <label className="feld"><span>IBAN</span><input name="iban" required autoComplete="off" spellCheck={false} placeholder="DE.. .... .... .... .... .." /></label>
                <label className="feld"><span>BIC (freiwillig)</span><input name="bic" autoComplete="off" spellCheck={false} /></label>
              </div>
              <label className="feld"><span>Ihr vollständiger Name</span><input name="name" required minLength={3} autoComplete="name" defaultValue={zugang.person ?? ""} /></label>
              <UnterschriftFeld name="mandatBild" beschriftung="Unterschrift Kontoinhaber bzw. Vertretung" />
              <label className="haken"><input type="checkbox" name="einverstanden" value="ja" required /><span>Ich ermächtige {marke.absender.firma}, die Monatsbeiträge und fällige Rechnungen aus unserem Vertrag per SEPA-Basislastschrift von diesem Konto einzuziehen, und weise meine Bank an, die Lastschriften einzulösen.</span></label>
              <button className="knopf">Mandat erteilen</button>
            </form>
          ) : null}
        </section>
      ) : null}

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
                  <td>{r.dokumentId ? <a className="klein" href={`/portal/k/${token}/dokument/${r.dokumentId}`} target="_blank">PDF</a> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="leise">Noch keine Rechnungen.</p>}
      </section>

      <section className="karte">
        <h2>Ihre Ansprechpartner</h2>
        <div className="portal-personen">
          {marke.personen.map((p) => (
            <div key={p.name} className="portal-person">
              {p.foto ? <img className="foto" src={p.foto} alt={p.name} width={72} height={72} /> : <span className="foto platzhalter" role="img" aria-label={`Foto von ${p.name} folgt`}><span>{p.kurz}</span><small>Foto folgt</small></span>}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <a className="kontaktzeile" href={`mailto:${p.email}`}><MailSymbol /><span>{p.email}</span></a>
                <a className="kontaktzeile" href={`tel:${p.telefon.replace(/\s/g, "")}`}><TelefonSymbol /><span>{p.telefon}</span></a>
              </div>
            </div>
          ))}
        </div>
        <div className="kontakt-allgemein">
          <a className="kontaktzeile" href={`tel:${marke.absender.telefon.replace(/\s/g, "")}`}><TelefonSymbol /><span>{marke.absender.telefon}</span></a>
          <a className="kontaktzeile" href={`mailto:${marke.absender.email}`}><MailSymbol /><span>{marke.absender.email}</span></a>
        </div>
        <p className="leise klein">Dieser Link ist nur für Sie. Bitte nicht weitergeben.</p>
      </section>
    </>
  );
}
