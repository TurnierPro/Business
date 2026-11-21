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
import { ueberallAbmelden } from "../aktionen";
import { apiSchluesselErzeugen, apiSchluesselWiderrufen, webhookAnlegen, webhookLoeschen, benutzerAendern, benutzerAnlegen, leadsImportieren, zweiFaktorBestaetigen, zweiFaktorStarten } from "../aktionen";

export const metadata = { title: "Einstellungen" };

export default async function Einstellungen() {
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
  return (
    <>
      <div className="kopfzeile"><div><h1>Einstellungen</h1><p>Konten, Sicherheit, Kalender, Schnittstelle und Import.</p></div></div>

      <div className="raster zwei" style={{ alignItems: "start" }}>
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

      <section className="karte abstand">
        <h2>Benutzer und Rollen</h2>
        <p className="leise klein">Benutzer, Rollen, API-Schlüssel, Webhooks und den Livegang ändert nur die Technik-Leitung, jeweils mit einem frischen Code aus der Authenticator-App. Jede Änderung steht im Protokoll.</p>
        <p className="leise klein">Admin: alles. Vertrieb und Technik: arbeiten und freigeben. Nur lesen: sieht alles, ändert nichts (z. B. Steuerberater, Aushilfe).</p>
        <table className="tabelle">
          <thead><tr><th>Name</th><th className="weg-mobil">E-Mail</th><th>Rolle</th><th className="weg-mobil">Zwei-Faktor</th></tr></thead>
          <tbody>
            {benutzer.map((b) => (
              <tr key={b.id}>
                <td>{b.name}{b.aktiv ? "" : <span className="status fehler" style={{ marginLeft: 6 }}>gesperrt</span>}</td>
                <td className="weg-mobil mono klein">{b.email}</td>
                <td>{admin ? null : ROLLEN[b.rolle as keyof typeof ROLLEN]}
                  {admin ? (
                    <form action={benutzerAendern} className="knopfreihe">
                      <input type="hidden" name="id" value={b.id} />
                      <select name="rolle" defaultValue={b.rolle} aria-label={`Rolle ${b.name}`} style={{ width: "auto" }}>{Object.entries(ROLLEN).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
                      <label className="haken"><input type="checkbox" name="aktiv" value="ja" defaultChecked={b.aktiv} /><span>aktiv</span></label>
                      {b.totpAktiv ? <label className="haken"><input type="checkbox" name="zweiFaktorAus" value="ja" /><span>2FA zurücksetzen</span></label> : null}
                      <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required placeholder="Code" aria-label="Code aus der Authenticator-App" style={{ width: 90 }} />
                      <button className="knopf klein">Speichern</button>
                    </form>
                  ) : null}
                </td>
                <td className="weg-mobil"><span className={`status ${b.totpAktiv ? "ok" : "warten"}`}>{b.totpAktiv ? "an" : "aus"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {admin ? (
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer" }}>Benutzer anlegen</summary>
            <form action={benutzerAnlegen} className="raster zwei" style={{ marginTop: 12 }}>
              <label className="feld"><span>Name</span><input name="name" required /></label>
              <label className="feld"><span>E-Mail</span><input name="email" type="email" required /></label>
              <label className="feld"><span>Rolle</span><select name="rolle" defaultValue="lesen">{Object.entries(ROLLEN).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
              <label className="feld"><span>Start-Passwort (mind. 10 Zeichen)</span><input name="passwort" type="text" minLength={10} required autoComplete="off" /></label>
              <label className="feld"><span>Code aus der Authenticator-App</span><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></label>
              <div><button className="knopf">Anlegen</button></div>
            </form>
          </details>
        ) : null}
      </section>

      <section className="karte abstand" id="api">
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
          <form action={apiSchluesselErzeugen} className="knopfreihe" style={{ marginTop: 12 }}>
            <input name="name" placeholder="Wofür? z. B. n8n" required aria-label="Name des Schlüssels" style={{ maxWidth: 220 }} />
            {Object.entries(RECHTE).map(([k, n]) => <label key={k} className="haken"><input type="checkbox" name="rechte" value={k} defaultChecked={k === "lesen"} /><span>{n}</span></label>)}
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required placeholder="Code" aria-label="Code aus der Authenticator-App" style={{ width: 90 }} />
            <button className="knopf">Schlüssel erzeugen</button>
          </form>
        ) : null}
      </section>

      <section className="karte abstand" id="webhooks">
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
          <form action={webhookAnlegen} style={{ marginTop: 12 }}>
            <div className="raster zwei">
              <label className="feld"><span>Name</span><input name="name" required placeholder="z. B. n8n Vertrieb" /></label>
              <label className="feld"><span>Adresse (https)</span><input name="url" type="url" required placeholder="https://n8n.levarex-consulting.de/webhook/…" /></label>
            </div>
            <div className="knopfreihe">{Object.entries(EREIGNISSE).map(([k, n]) => <label key={k} className="haken"><input type="checkbox" name="ereignisse" value={k} /><span>{n}</span></label>)}</div>
            <label className="feld" style={{ maxWidth: 220, marginTop: 8 }}><span>Code aus der Authenticator-App</span><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></label>
            <button className="knopf" style={{ marginTop: 8 }}>Webhook anlegen</button>
          </form>
        ) : null}
      </section>

      <section className="karte abstand">
        <h2>Leads importieren (CSV)</h2>
        <p className="leise klein">Aus Excel oder einem alten CRM. Erste Zeile: Spaltennamen, z. B. <span className="mono">Firma;Gewerk;Ansprechpartner;Straße;PLZ;Ort;Telefon;E-Mail;Website;Quelle</span>. Doppelte und Betriebe auf der Sperrliste werden übersprungen. Die Quelle (Art. 14 DSGVO) wird gespeichert.</p>
        <form action={leadsImportieren} encType="multipart/form-data" className="knopfreihe">
          <input type="file" name="datei" accept=".csv,text/csv" required aria-label="CSV-Datei" style={{ maxWidth: 320 }} />
          <button className="knopf">Importieren</button>
        </form>
      </section>
    </>
  );
}
