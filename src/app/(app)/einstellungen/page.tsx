import { cookies } from "next/headers";
import { desc, eq } from "drizzle-orm";
import QRCode from "qrcode";
import { brauchtBenutzer, darf, ROLLEN } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { otpauthUrl } from "@/lib/totp";
import { kalenderLink } from "@/lib/kalender";
import { RECHTE } from "@/lib/api";
import { EREIGNISSE } from "@/lib/webhooks";
import { basisUrl } from "@/lib/ablauf/gemeinsam";
import { datum, datumZeit } from "@/lib/format";
import { entschluessele } from "@/lib/geheim";
import { postfachEntfernen, postfachSpeichern, ueberallAbmelden } from "../aktionen";
import { AufEinenBlick, SeitenKopf, SeitenReiter, reiterWahl } from "@/components/Seite";
import { apiSchluesselErzeugen, apiSchluesselWiderrufen, webhookAnlegen, webhookLoeschen, benutzerAendern, benutzerAnlegen, zweiFaktorBestaetigen, zweiFaktorStarten } from "../aktionen";

export const metadata = { title: "Benutzer und Sicherheit" };

export default async function Einstellungen({ searchParams }: { searchParams: Promise<{ reiter?: string }> }) {
  const ich = await brauchtBenutzer();
  const admin = darf(ich, "verwalten");
  const db = await getDb();
  const [[mein], benutzer, schluessel] = await Promise.all([
    db.select().from(schema.benutzer).where(eq(schema.benutzer.id, ich.id)),
    db.select().from(schema.benutzer).orderBy(schema.benutzer.name),
    db.select().from(schema.apiSchluessel).orderBy(desc(schema.apiSchluessel.erstelltAm)),
  ]);
  const neuerSchluessel = (await cookies()).get("lvx_neuer_schluessel")?.value;
  const neuesGeheimnis = (await cookies()).get("lvx_neues_geheimnis")?.value;
  const hooks = await (await getDb()).select().from(schema.webhooks);
  const geheim = mein.totpGeheim && !mein.totpAktiv ? entschluessele(mein.totpGeheim) : null;
  const qr = geheim ? await QRCode.toDataURL(otpauthUrl(geheim, mein.email), { margin: 1, width: 220 }) : null;
  const kalender = await kalenderLink(ich.id);
  const aktiveBenutzer = benutzer.filter((b) => b.aktiv);
  const meinPostfach = benutzer.find((b) => b.id === ich.id)?.postfach ?? null;
  const mitFaktor = aktiveBenutzer.filter((b) => b.totpAktiv).length;
  const aktiveSchluessel = schluessel.filter((x) => !x.widerrufenAm);
  const liste = [
    { key: "konto", name: "Mein Konto", zahl: mein.totpAktiv ? undefined : "2FA aus", ton: mein.totpAktiv ? undefined : ("warten" as const) },
    { key: "benutzer", name: "Benutzer und Rollen", zahl: aktiveBenutzer.length },
    { key: "schnittstelle", name: "Schnittstelle und n8n", zahl: aktiveSchluessel.length + hooks.length },
  ];
  const reiter = reiterWahl((await searchParams).reiter ?? (neuerSchluessel || neuesGeheimnis ? "schnittstelle" : undefined), liste);
  return (
    <>
      <SeitenKopf titel="Benutzer und Sicherheit" text="Dein Konto mit Postfach, wer Zugang hat und die Schnittstelle für n8n." />
      <AufEinenBlick werte={[
        { wert: mein.totpAktiv ? "an" : "aus", name: "deine Zwei-Faktor-Anmeldung", ton: mein.totpAktiv ? "ok" : "warten", href: "/einstellungen?reiter=konto" },
        { wert: aktiveBenutzer.length, name: "aktive Benutzer", href: "/einstellungen?reiter=benutzer" },
        { wert: `${mitFaktor}/${aktiveBenutzer.length}`, name: "mit Zwei-Faktor", ton: mitFaktor === aktiveBenutzer.length ? "ok" : "warten", href: "/einstellungen?reiter=benutzer" },
        { wert: aktiveSchluessel.length, name: "API-Schlüssel aktiv", href: "/einstellungen?reiter=schnittstelle" },
        { wert: hooks.length, name: "Webhooks", href: "/einstellungen?reiter=schnittstelle" },
      ]} />
      <SeitenReiter basis="/einstellungen" aktiv={reiter} liste={liste} />

      {reiter === "konto" ? (
      <>
      <div className="raster drei" style={{ alignItems: "stretch" }}>
        <section className="karte" id="zwei-faktor">
          <h2>Zwei-Faktor-Anmeldung</h2>
          {mein.totpAktiv ? (
            <p><span className="status ok">aktiv</span> Bei der Anmeldung fragt Levarex OS nach dem Code aus deiner App.</p>
          ) : qr ? (
            <>
              <p>1. QR-Code mit einer Authenticator-App scannen (z. B. 2FAS, 1Password, Google Authenticator). 2. Den 6-stelligen Code eingeben.</p>
              <img src={qr} alt="QR-Code für die Authenticator-App" width={220} height={220} style={{ background: "#fff", borderRadius: 6 }} />
              <p className="leise klein mono" style={{ wordBreak: "break-all" }}>Schlüssel zum Abtippen: {geheim}</p>
              <form action={zweiFaktorBestaetigen} className="knopfreihe">
                <input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" aria-label="Code" required style={{ maxWidth: 160 }} className="mono" />
                <button className="knopf haupt">Bestätigen und einschalten</button>
              </form>
            </>
          ) : (
            <>
              <p><span className="status warten">aus</span> Ohne zweiten Faktor reicht ein gestohlenes Passwort. Vor dem ersten echten Kunden für alle einschalten.</p>
              <form action={zweiFaktorStarten}><button className="knopf">Einrichten</button></form>
            </>
          )}
        </section>

        <section className="karte">
          <h2>Passwort und Sitzungen</h2>
          <p>Passwort ändern beendet alle anderen Sitzungen. „Überall abmelden“ hilft, wenn ein Gerät verloren ging.</p>
          <div className="knopfreihe"><a className="knopf" href="/passwort">Passwort ändern</a><form action={ueberallAbmelden}><button className="knopf">Überall abmelden</button></form></div>
        </section>
        <section className="karte">
          <h2>Kalender abonnieren</h2>
          <p>Deine Termine und fälligen Aufgaben im Handy-Kalender. In iPhone: Einstellungen → Kalender → Accounts → Kalenderabo hinzufügen. In Outlook oder Google: „Aus dem Internet“ bzw. „Per URL“.</p>
          <p className="mono klein" style={{ wordBreak: "break-all", userSelect: "all" }}>{kalender}</p>
          <p className="leise klein">Der Link ist geheim. Nicht weitergeben.</p>
        </section>
      </div>
        <section className="karte abstand-oben" id="postfach">
          <h2>Mein Postfach</h2>
          <p className="leise klein">Mails, die du unterschreibst (oder freigibst), gehen von deinem eigenen Postfach raus und liegen danach in deinem Ordner „Gesendet“. Ohne eigenes Postfach gilt der allgemeine Absender. Das Passwort wird verschlüsselt gespeichert und nie wieder angezeigt.</p>
          {meinPostfach ? (
            <p><span className="status ok">verbunden</span> <span className="mono">{meinPostfach.name} &lt;{meinPostfach.absender}&gt;</span> über <span className="mono">{meinPostfach.host}:{meinPostfach.port}</span>{meinPostfach.geprueftAm ? <span className="leise klein"> · geprüft {datum(new Date(meinPostfach.geprueftAm))}</span> : null}</p>
          ) : <p><span className="status warten">nicht verbunden</span> Deine Mails gehen über den allgemeinen Absender.</p>}
          <details open={!meinPostfach} style={{ marginTop: 8 }}>
            <summary className="knopf klein">{meinPostfach ? "Ändern" : "Postfach verbinden"}</summary>
            <form action={postfachSpeichern} style={{ display: "grid", gap: 10, marginTop: 10 }}>
              <div className="raster vier">
                <label className="feld"><span>Absender-Adresse</span><input name="absender" type="email" required defaultValue={meinPostfach?.absender ?? ""} placeholder="m.steiner@levarex-consulting.de" autoComplete="off" /></label>
                <label className="feld"><span>Name als Absender</span><input name="name" defaultValue={meinPostfach?.name ?? ich.name} /></label>
                <label className="feld"><span>Mailserver (SMTP)</span><input name="host" required defaultValue={meinPostfach?.host ?? ""} placeholder="z. B. mx2f3a.netcup.net (netcup: Webhosting → E-Mail)" autoComplete="off" /></label>
                <label className="feld"><span>SMTP-Port</span><select name="port" defaultValue={String(meinPostfach?.port ?? 587)}><option value="587">587 (STARTTLS, empfohlen)</option><option value="465">465 (SSL)</option></select></label>
                <label className="feld"><span>Benutzername</span><input name="benutzer" defaultValue={meinPostfach?.benutzer ?? ""} placeholder="meist die volle Mailadresse" autoComplete="off" /></label>
                <label className="feld"><span>Passwort {meinPostfach ? "(leer lassen = bisheriges behalten)" : ""}</span><input name="passwort" type="password" required={!meinPostfach} autoComplete="new-password" /></label>
                <label className="feld"><span>IMAP-Server (für „Gesendet“)</span><input name="imapHost" defaultValue={meinPostfach?.imapHost ?? ""} placeholder="leer = wie SMTP-Server" autoComplete="off" /></label>
                <label className="feld"><span>IMAP-Port</span><input name="imapPort" defaultValue={String(meinPostfach?.imapPort ?? 993)} inputMode="numeric" /></label>
              </div>
              <div className="knopfreihe">
                <button className="knopf">Prüfen und speichern</button>
                <span className="leise klein">Levarex OS meldet sich einmal an (SMTP und IMAP) und schickt dabei nichts.</span>
              </div>
            </form>
            {meinPostfach ? <form action={postfachEntfernen} style={{ marginTop: 8 }}><button className="knopf klein gefahr">Postfach trennen</button></form> : null}
          </details>
        </section>

      </>
      ) : null}

      {reiter === "benutzer" ? (
      <section className="karte">
        <p className="leise klein" style={{ marginTop: 0 }}>Admin: alles. Vertrieb und Technik: arbeiten und freigeben. Nur lesen: sieht alles, ändert nichts (z. B. Steuerberater, Aushilfe). Änderungen nur mit frischem Code aus der Authenticator-App; jede steht im Protokoll.</p>
        <ul className="zeilen benutzerliste">
          {benutzer.map((b) => (
            <li key={b.id}>
              <div>
                <div className="titel">{b.name}{b.id === ich.id ? <span className="leise"> (du)</span> : null}</div>
                <div className="unter mono">{b.email}</div>
              </div>
              <div className="knopfreihe" style={{ gap: 8 }}>
                <span className="marke-klein" style={{ margin: 0 }}>{ROLLEN[b.rolle as keyof typeof ROLLEN]}</span>
                <span className={`status ${b.totpAktiv ? "ok" : "warten"}`}>2FA {b.totpAktiv ? "an" : "aus"}</span>
                <span className={`status ${b.postfach ? "ok" : ""}`} title={b.postfach?.absender ?? "allgemeiner Absender"}>Postfach {b.postfach ? "eigenes" : "allgemein"}</span>
                <span className={`status ${b.aktiv ? "ok" : "fehler"}`}>{b.aktiv ? "aktiv" : "gesperrt"}</span>
              </div>
              {admin ? (
                <details className="zeile-bearbeiten">
                  <summary className="klein">Ändern</summary>
                  <form action={benutzerAendern} className="knopfreihe" style={{ marginTop: 8 }}>
                    <input type="hidden" name="id" value={b.id} />
                    <label className="feld" style={{ margin: 0 }}><span>Rolle</span><select name="rolle" defaultValue={b.rolle} aria-label={`Rolle ${b.name}`}>{Object.entries(ROLLEN).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
                    <label className="haken"><input type="checkbox" name="aktiv" value="ja" defaultChecked={b.aktiv} /><span>aktiv</span></label>
                    {b.totpAktiv ? <label className="haken"><input type="checkbox" name="zweiFaktorAus" value="ja" /><span>Zwei-Faktor zurücksetzen</span></label> : null}
                    <label className="feld" style={{ margin: 0 }}><span>Code</span><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required placeholder="123456" aria-label="Code aus der Authenticator-App" style={{ width: 110 }} /></label>
                    <button className="knopf klein">Speichern</button>
                  </form>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
        {admin ? (
          <details className="abstand-oben">
            <summary className="knopf klein" style={{ display: "inline-flex" }}>+ Benutzer anlegen</summary>
            <form action={benutzerAnlegen} className="raster zwei" style={{ marginTop: 12 }}>
              <label className="feld"><span>Name</span><input name="name" required /></label>
              <label className="feld"><span>E-Mail</span><input name="email" type="email" required /></label>
              <label className="feld"><span>Rolle</span><select name="rolle" defaultValue="lesen">{Object.entries(ROLLEN).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
              <label className="feld"><span>Start-Passwort (mind. 10 Zeichen)</span><input name="passwort" type="text" minLength={10} required autoComplete="off" /></label>
              <label className="feld"><span>Code aus der Authenticator-App</span><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></label>
              <div style={{ alignSelf: "end" }}><button className="knopf">Anlegen</button></div>
            </form>
          </details>
        ) : null}
      </section>
      ) : null}

      {reiter === "schnittstelle" ? (
      <div className="raster zwei" style={{ alignItems: "start" }}>
      <section className="karte" id="api">
        <h2>Schnittstelle (API)</h2>
        <p className="leise klein">Für n8n, Website-Formulare oder andere Programme. Adresse: <span className="mono">{basisUrl()}/api/v1/…</span> mit <span className="mono">Authorization: Bearer lvx_…</span>. Alle Endpunkte und Felder stehen in <a href="/api/v1/openapi.json" target="_blank" className="mono">/api/v1/openapi.json</a> (in n8n importierbar). Was die Schnittstelle anlegt, läuft durch dieselben Regeln wie alles andere (Sperrliste, Freigabe); versenden kann sie nichts. Höchstens 120 Anfragen je Minute und Schlüssel, jeder Zugriff wird protokolliert.</p>
        {neuerSchluessel ? <div className="hinweis ok" role="status">Neuer Schlüssel, nur jetzt sichtbar: <span className="mono" style={{ userSelect: "all", wordBreak: "break-all" }}>{neuerSchluessel}</span></div> : null}
        {schluessel.length ? (
          <table className="tabelle">
            <thead><tr><th>Name</th><th>Rechte</th><th className="weg-mobil">Zuletzt benutzt</th><th></th></tr></thead>
            <tbody>
              {schluessel.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}<div className="leise klein mono">{s.praefix}… · {datum(s.erstelltAm)}</div></td>
                  <td className="klein">{s.rechte.map((r) => RECHTE[r] ?? r).join(", ")}</td>
                  <td className="weg-mobil klein">{s.zuletztAm ? datumZeit(s.zuletztAm) : "nie"}</td>
                  <td>{s.widerrufenAm ? <span className="status fehler">widerrufen</span> : admin ? <form action={apiSchluesselWiderrufen}><input type="hidden" name="id" value={s.id} /><button className="knopf klein">Widerrufen</button></form> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="leise">Noch keine Schlüssel.</p>}
        {admin ? (
          <details className="abstand-oben">
            <summary className="knopf klein" style={{ display: "inline-flex" }}>+ Schlüssel erzeugen</summary>
            <form action={apiSchluesselErzeugen} style={{ marginTop: 12 }}>
              <label className="feld"><span>Wofür?</span><input name="name" placeholder="z. B. n8n" required /></label>
              <fieldset className="rechte-wahl"><legend className="klein leise">Rechte</legend>
                {Object.entries(RECHTE).map(([k, n]) => <label key={k} className="haken"><input type="checkbox" name="rechte" value={k} defaultChecked={k === "lesen"} /><span>{n}</span></label>)}
              </fieldset>
              <div className="knopfreihe" style={{ alignItems: "end" }}>
                <label className="feld" style={{ margin: 0 }}><span>Code aus der Authenticator-App</span><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required style={{ width: 140 }} /></label>
                <button className="knopf">Schlüssel erzeugen</button>
              </div>
            </form>
          </details>
        ) : null}
      </section>

      <section className="karte" id="webhooks">
        <h2>Webhooks (z. B. an n8n)</h2>
        <p className="leise klein">Bei einem Ereignis schickt Levarex OS einen signierten POST mit Ereignis und IDs, keine Kundendaten. Die Details holt n8n mit seinem API-Schlüssel. Prüfen in n8n: Kopf <span className="mono">X-Levarex-Signatur</span> = <span className="mono">sha256=HMAC(Geheimnis, X-Levarex-Zeit + "." + Body)</span>.</p>
        {neuesGeheimnis ? <div className="hinweis ok" role="status">Geheimnis für die Signaturprüfung, nur jetzt sichtbar: <span className="mono" style={{ userSelect: "all", wordBreak: "break-all" }}>{neuesGeheimnis}</span></div> : null}
        {hooks.length ? (
          <ul className="liste">
            {hooks.map((w) => (
              <li key={w.id}>
                <div><div className="titel">{w.name}</div><div className="unter mono">{w.url}</div><div className="unter">{w.ereignisse.map((e) => EREIGNISSE[e] ?? e).join(", ")}{w.letzterVersand ? ` · zuletzt ${datumZeit(w.letzterVersand)}` : ""}{w.letzterFehler ? ` · Fehler: ${w.letzterFehler}` : ""}</div></div>
                {admin ? <form action={webhookLoeschen}><input type="hidden" name="id" value={w.id} /><button className="knopf klein gefahr">Löschen</button></form> : null}
              </li>
            ))}
          </ul>
        ) : <p className="leise">Noch keine Webhooks.</p>}
        {admin ? (
          <details className="abstand-oben">
          <summary className="knopf klein" style={{ display: "inline-flex" }}>+ Webhook anlegen</summary>
          <form action={webhookAnlegen} style={{ marginTop: 12 }}>
            <div>
              <label className="feld"><span>Name</span><input name="name" required placeholder="z. B. n8n Vertrieb" /></label>
              <label className="feld"><span>Adresse (https)</span><input name="url" type="url" required placeholder="https://n8n.levarex-consulting.de/webhook/…" /></label>
            </div>
            <fieldset className="rechte-wahl"><legend className="klein leise">Bei welchen Ereignissen?</legend>{Object.entries(EREIGNISSE).map(([k, n]) => <label key={k} className="haken"><input type="checkbox" name="ereignisse" value={k} /><span>{n}</span></label>)}</fieldset>
            <div className="knopfreihe" style={{ alignItems: "end" }}>
              <label className="feld" style={{ margin: 0 }}><span>Code aus der Authenticator-App</span><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required style={{ width: 140 }} /></label>
              <button className="knopf">Webhook anlegen</button>
            </div>
          </form>
          </details>
        ) : null}
      </section>

      </div>
      ) : null}

    </>
  );
}
