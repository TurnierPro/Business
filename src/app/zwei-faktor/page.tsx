import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { aktuellerBenutzer } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { entschluessele } from "@/lib/geheim";
import { otpauthUrl } from "@/lib/totp";
import { Logo } from "@/components/Logo";
import { Meldung } from "@/components/Meldung";
import { zweiFaktorBestaetigen, zweiFaktorStarten } from "../(app)/aktionen";

export const metadata = { title: "Zwei-Faktor einrichten" };
export const dynamic = "force-dynamic";

// Eigene Seite außerhalb des App-Rahmens: Ohne zweiten Faktor kommt auf dem Server niemand ins System.
export default async function ZweiFaktor() {
  const ich = await aktuellerBenutzer();
  if (!ich) redirect("/login");
  if (ich.mussPasswortAendern) redirect("/passwort");
  const db = await getDb();
  const [b] = await db.select().from(schema.benutzer).where(eq(schema.benutzer.id, ich.id));
  if (b.totpAktiv) redirect("/");
  const geheim = b.totpGeheim ? entschluessele(b.totpGeheim) : null;
  const qr = geheim ? await QRCode.toDataURL(otpauthUrl(geheim, b.email), { margin: 1, width: 240 }) : null;
  return (
    <div className="zentriert">
      <div style={{ width: "100%", maxWidth: 560 }}>
        <div style={{ marginBottom: 28 }}><Logo hoehe={30} /></div>
        <Suspense><Meldung /></Suspense>
        <section className="karte">
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Zwei-Faktor-Anmeldung einrichten</h1>
          <p className="leise">Damit ein gestohlenes Passwort allein nicht reicht. Einmal einrichten, dann fragt Levarex OS bei jeder Anmeldung nach dem 6-stelligen Code aus der App.</p>
          <ol className="fortschritt" style={{ marginTop: 12 }}>
            <li className="erledigt"><span className="punkt" aria-hidden="true">1</span><div><div className="titel">App aufs Handy</div><div className="unter">z. B. Bitwarden Authenticator, 2FAS, Microsoft oder Google Authenticator</div></div></li>
            <li className={qr ? "erledigt" : "aktuell"}><span className="punkt" aria-hidden="true">2</span><div><div className="titel">QR-Code anzeigen und scannen</div><div className="unter">In der App auf „+“ tippen und den Code abfotografieren</div></div></li>
            <li className={qr ? "aktuell" : ""}><span className="punkt" aria-hidden="true">3</span><div><div className="titel">Code eingeben</div><div className="unter">Die 6 Ziffern, die die App gerade zeigt</div></div></li>
          </ol>
          {qr ? (
            <div style={{ display: "grid", gap: 14, justifyItems: "start", marginTop: 8 }}>
              <img src={qr} alt="QR-Code für die Authenticator-App" width={240} height={240} style={{ background: "#fff", borderRadius: 14 }} />
              <p className="leise klein mono" style={{ wordBreak: "break-all", margin: 0 }}>Zum Abtippen: {geheim}</p>
              <form action={zweiFaktorBestaetigen} className="knopfreihe" style={{ width: "100%" }}>
                <input type="hidden" name="weiter" value="/" />
                <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" placeholder="123456" aria-label="Code aus der App" required style={{ maxWidth: 180 }} className="mono" />
                <button className="knopf haupt">Bestätigen und einschalten</button>
              </form>
            </div>
          ) : (
            <form action={zweiFaktorStarten} style={{ marginTop: 8 }}>
              <input type="hidden" name="zurueck" value="/zwei-faktor" />
              <button className="knopf haupt">QR-Code anzeigen</button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
