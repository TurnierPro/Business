import { brauchtBenutzer, darf } from "@/lib/auth";
import { KATEGORIEN, konnektoren } from "@/lib/konnektoren";
import { aktiverMailDienst, MAIL_DIENSTE, smtpDiagnose } from "@/lib/adapters/mail";
import { Status } from "@/components/Status";
import { AufEinenBlick, SeitenKopf, SeitenReiter, reiterWahl } from "@/components/Seite";
import { pushTestenAktion, testmailAnMich } from "../../aktionen";

export const metadata = { title: "Konnektoren" };

// Anschlüsse an eure Werkzeuge. Ohne Zugangsdaten läuft jeder im Simulator; nach draußen geht trotzdem alles nur über die Freigaben.
export default async function Konnektoren({ searchParams }: { searchParams: Promise<{ reiter?: string; pruefen?: string }> }) {
  const ich = await brauchtBenutzer();
  const alle = await konnektoren();
  const mail = aktiverMailDienst();
  const zahl = (st: string) => alle.filter((k) => k.status === st).length;
  const liste = [{ key: "alle", name: "Alle", zahl: alle.length }, ...KATEGORIEN.filter((k) => alle.some((x) => x.kategorie === k)).map((k) => ({ key: k, name: k, zahl: alle.filter((x) => x.kategorie === k).length }))];
  const sp = await searchParams;
  const reiter = reiterWahl(sp.reiter, liste);
  // Verbindungsprüfung nur auf Knopfdruck (meldet sich einmal beim Mailserver an, sendet nichts)
  const diagnose = sp.pruefen === "smtp" && darf(ich, "aendern") ? await smtpDiagnose() : null;
  const kategorien = reiter === "alle" ? KATEGORIEN : [reiter];

  return (
    <>
      <SeitenKopf titel="Konnektoren" text="Anschlüsse an E-Mail, WhatsApp, Lexware Office, Qonto, Plaud und n8n. Ohne Zugangsdaten läuft jeder Anschluss im Simulator.">
        {darf(ich, "aendern") ? <a className="knopf" href="/stammdaten/konnektoren?reiter=E-Mail&pruefen=smtp#smtp-pruefung">Verbindung prüfen</a> : null}
        {darf(ich, "aendern") && process.env.NTFY_URL ? <form action={pushTestenAktion}><button className="knopf">Push testen</button></form> : null}
        {darf(ich, "aendern") ? <form action={testmailAnMich}><button className="knopf" title="Landet zuerst in den Freigaben, dort mit Vorschau im Mail-Design. Nach der Freigabe geht sie an deine Adresse.">Testmail an mich</button></form> : null}
      </SeitenKopf>
      <AufEinenBlick werte={[
        { wert: mail === "simulator" ? "Simulator" : mail === "smtp" ? "netcup" : MAIL_DIENSTE[mail].name, name: "E-Mail-Versand läuft über", ton: mail === "simulator" ? "warten" : "ok" },
        { wert: zahl("aktiv"), name: "aktiv angebunden", ton: "ok" },
        { wert: zahl("simulator"), name: "im Simulator", ton: zahl("simulator") ? "warten" : undefined },
        { wert: zahl("bereit"), name: "bereit zum Anschließen" },
        { wert: zahl("bewusst_aus"), name: "bewusst aus" },
      ]} />
      <SeitenReiter basis="/stammdaten/konnektoren" aktiv={reiter} liste={liste} />
      {diagnose ? (
        <section className={`hinweis ${diagnose.ok ? "ok" : "fehler"}`} id="smtp-pruefung" role="status" style={{ marginBottom: 16 }}>
          <p style={{ margin: "0 0 8px" }}><strong>{diagnose.ok ? "Verbindung in Ordnung." : "Verbindung klappt nicht."}</strong> {diagnose.ergebnis}</p>
          <p className="klein mono" style={{ margin: "0 0 8px" }}>Server {diagnose.host || "–"} · Port {diagnose.port} · Benutzer {diagnose.benutzer || "–"} · Passwort {diagnose.passwortLaenge} Zeichen · Absender {diagnose.absender || "–"}</p>
          {diagnose.auffaellig.length ? <ul className="klein" style={{ margin: 0 }}>{diagnose.auffaellig.map((a) => <li key={a}>{a}</li>)}</ul> : null}
          {!diagnose.ok ? <p className="klein" style={{ margin: "8px 0 0" }}>Stimmt die Zahl der Zeichen nicht mit eurem Passwort überein, hat Coolify es verändert (oft wegen „$“): bei SMTP_PASS „Is Literal“ setzen, speichern, neu deployen.</p> : null}
        </section>
      ) : null}

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
        <p className="leise klein">E-Mails gehen in zwei Fassungen raus: im Levarex-Design und als reiner Text, vom Postfach der Person, die unterschreibt (Einstellungen → Mein Postfach), sonst vom allgemeinen Absender.</p>
      ) : null}
      <div className="hinweis" role="note">
        Zugangsdaten nie hier eintippen oder in den Chat kopieren. Sie gehören in Coolify unter <span className="mono">Environment Variables</span> und in Bitwarden. Nach dem Eintragen in Coolify neu deployen. Ausnahme: das eigene Postfach unter Einstellungen → Mein Postfach (dort verschlüsselt gespeichert).
      </div>
    </>
  );
}
