import { brauchtBenutzer, darf } from "@/lib/auth";
import { KATEGORIEN, konnektoren } from "@/lib/konnektoren";
import { aktiverMailDienst, MAIL_DIENSTE } from "@/lib/adapters/mail";
import { Status } from "@/components/Status";
import { AufEinenBlick, SeitenKopf, SeitenReiter, reiterWahl } from "@/components/Seite";
import { testmailAnMich } from "../../aktionen";

export const metadata = { title: "Konnektoren" };

// Anschlüsse an eure Werkzeuge. Ohne Zugangsdaten läuft jeder im Simulator; nach draußen geht trotzdem alles nur über die Freigaben.
export default async function Konnektoren({ searchParams }: { searchParams: Promise<{ reiter?: string }> }) {
  const ich = await brauchtBenutzer();
  const alle = await konnektoren();
  const mail = aktiverMailDienst();
  const zahl = (st: string) => alle.filter((k) => k.status === st).length;
  const liste = [{ key: "alle", name: "Alle", zahl: alle.length }, ...KATEGORIEN.filter((k) => alle.some((x) => x.kategorie === k)).map((k) => ({ key: k, name: k, zahl: alle.filter((x) => x.kategorie === k).length }))];
  const reiter = reiterWahl((await searchParams).reiter, liste);
  const kategorien = reiter === "alle" ? KATEGORIEN : [reiter];

  return (
    <>
      <SeitenKopf titel="Konnektoren" text="Anschlüsse an Outlook oder Gmail, WhatsApp, Telefonanlage, Lexware Office, Qonto und mehr. Ohne Zugangsdaten läuft jeder Anschluss im Simulator.">
        {darf(ich, "aendern") ? <form action={testmailAnMich}><button className="knopf" title="Landet zuerst in den Freigaben, dort mit Vorschau im Mail-Design">Testmail an mich</button></form> : null}
      </SeitenKopf>
      <AufEinenBlick werte={[
        { wert: MAIL_DIENSTE[mail].name, name: "E-Mail-Versand läuft über", ton: mail === "simulator" ? "warten" : "ok" },
        { wert: zahl("aktiv"), name: "aktiv angebunden", ton: "ok" },
        { wert: zahl("simulator"), name: "im Simulator", ton: zahl("simulator") ? "warten" : undefined },
        { wert: zahl("bereit"), name: "bereit zum Anschließen" },
        { wert: zahl("bewusst_aus"), name: "bewusst aus" },
      ]} />
      <SeitenReiter basis="/stammdaten/konnektoren" aktiv={reiter} liste={liste} />

      {kategorien.map((kat) => {
        const teil = alle.filter((k) => k.kategorie === kat);
        if (!teil.length) return null;
        return (
          <section key={kat} className="karte abstand-klein">
            <h3 className="gruppe-titel">{kat}</h3>
            <div className="register">
              {teil.map((k) => (
                <details key={k.key}>
                  <summary>
                    <div><div className="titel">{k.name}</div><div className="klein leise">{k.zweck}</div></div>
                    <Status wert={k.status === "bereit" ? "bereit_anschluss" : k.status} />
                  </summary>
                  <div className="inhalt">
                    <ol style={{ margin: "0 0 8px", paddingLeft: 20 }}>{k.schritte.map((x) => <li key={x} className="klein">{x}</li>)}</ol>
                    {k.braucht.length ? (
                      <p className="klein">Zugangsdaten: {k.braucht.map((b) => <span key={b} className="mono" style={{ marginRight: 8 }}>{b}{process.env[b] ? " ✓" : ""}</span>)}</p>
                    ) : null}
                    {k.datenschutz ? <p className="leise klein">Datenschutz: {k.datenschutz}</p> : null}
                  </div>
                </details>
              ))}
            </div>
          </section>
        );
      })}

      {reiter === "alle" || reiter === "E-Mail" ? (
        <p className="leise klein">E-Mails gehen in zwei Fassungen raus: im Levarex-Design und als reiner Text. Den Weg legt der erste vollständige Zugang fest, oder fest mit <span className="mono">MAIL_DIENST</span> (microsoft, google, smtp, resend, simulator).</p>
      ) : null}
      <div className="hinweis" role="note">
        Zugangsdaten nie hier eintippen oder in den Chat kopieren. Sie gehören in die Datei <span className="mono">.env</span> auf dem Server (Vorlage: <span className="mono">.env.example</span>) und in euren Passwortmanager. Nach dem Eintragen den Server neu starten.
      </div>
    </>
  );
}
