import { brauchtBenutzer, darf } from "@/lib/auth";
import { KATEGORIEN, konnektoren } from "@/lib/konnektoren";
import { aktiverMailDienst, MAIL_DIENSTE } from "@/lib/adapters/mail";
import { Status } from "@/components/Status";
import { testmailAnMich } from "../../aktionen";

export const metadata = { title: "Konnektoren" };

export default async function Konnektoren() {
  const ich = await brauchtBenutzer();
  const liste = await konnektoren();
  const mail = aktiverMailDienst();
  return (
    <>
      <div className="kopfzeile">
        <div>
          <h1>Konnektoren</h1>
          <p>Hier hängt Nexova OS an eure Werkzeuge: Outlook oder Gmail, WhatsApp, Telefonanlage, Stripe und mehr. Ohne Zugangsdaten läuft jeder Anschluss im Simulator. Alles, was nach draußen geht, läuft trotzdem immer über die Freigaben.</p>
        </div>
      </div>

      <div className="karte abstand">
        <h2>E-Mail-Versand</h2>
        <p>Aktiv: <b>{MAIL_DIENSTE[mail].name}</b> <Status wert={mail === "simulator" ? "simulator" : "aktiv"} /></p>
        <p className="leise">Jede Mail geht in zwei Fassungen raus: im Nexova-Design (hell, Logo, Signatur mit Pflichtangaben) und als reiner Text für alte Mail-Programme. Den Weg legt der erste vollständige Zugang fest, oder fest mit <span className="mono">MAIL_DIENST</span> (microsoft, google, smtp, resend, simulator).</p>
        {darf(ich, "aendern") ? (
          <form action={testmailAnMich}>
            <button className="knopf haupt">Testmail an mich ({ich.email})</button>
            <p className="leise klein" style={{ marginTop: 8 }}>Die Testmail landet zuerst in den Freigaben. Dort siehst du die Vorschau im Mail-Design.</p>
          </form>
        ) : null}
      </div>

      {KATEGORIEN.map((kat) => {
        const teil = liste.filter((k) => k.kategorie === kat);
        if (!teil.length) return null;
        return (
          <section key={kat} className="abstand">
            <h2>{kat}</h2>
            <div className="raster zwei" style={{ alignItems: "start" }}>
              {teil.map((k) => (
                <details key={k.key} className="karte">
                  <summary style={{ cursor: "pointer", listStyle: "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                      <b>{k.name}</b>
                      <Status wert={k.status === "bereit" ? "bereit_anschluss" : k.status} />
                    </div>
                    <div className="leise klein" style={{ marginTop: 4 }}>{k.zweck}</div>
                  </summary>
                  <ol style={{ marginTop: 12 }}>{k.schritte.map((x) => <li key={x} className="klein">{x}</li>)}</ol>
                  {k.braucht.length ? (
                    <p className="klein">Zugangsdaten: {k.braucht.map((b) => <span key={b} className="mono" style={{ marginRight: 8 }}>{b}{process.env[b] ? " ✓" : ""}</span>)}</p>
                  ) : null}
                  {k.datenschutz ? <p className="leise klein">Datenschutz: {k.datenschutz}</p> : null}
                </details>
              ))}
            </div>
          </section>
        );
      })}

      <div className="hinweis abstand" role="note">
        Zugangsdaten nie hier eintippen oder in den Chat kopieren. Sie gehören in die Datei <span className="mono">.env</span> auf dem Server (Vorlage: <span className="mono">.env.example</span>) und in euren Passwortmanager. Nach dem Eintragen den Server neu starten.
      </div>
    </>
  );
}
