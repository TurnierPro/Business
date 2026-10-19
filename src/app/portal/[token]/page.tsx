import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { inhalteEinreichen, projektPerToken } from "@/lib/ablauf/lieferung";
import { PAKETE, PaketKey } from "@/lib/pakete";

export const metadata = { title: "Inhalte für Ihre Seite", robots: { index: false } };

async function senden(f: FormData) {
  "use server";
  const token = String(f.get("token"));
  let fehler = "";
  try {
    await inhalteEinreichen(token, f);
  } catch (e) {
    fehler = e instanceof Error ? e.message : "Unbekannter Fehler";
  }
  redirect(`/portal/${token}${fehler ? `?fehler=${encodeURIComponent(fehler)}` : ""}`);
}

export default async function Portal({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ fehler?: string }> }) {
  const { token } = await params;
  const p = await projektPerToken(token);
  if (!p) notFound();
  const db = await getDb();
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, p.betriebId));
  const { fehler } = await searchParams;
  const mitKarriere = ["M", "L"].includes(p.paket);

  if (p.status !== "inhalte") {
    return (
      <div className="karte">
        <h1>Danke, alles ist da.</h1>
        <p style={{ marginTop: 12 }}>Wir bauen jetzt Ihre Seite und melden uns, sobald Sie sie ansehen können. Fragen? Rufen Sie uns einfach an.</p>
      </div>
    );
  }
  return (
    <>
      <h1>Inhalte für {b?.name}</h1>
      <p className="leise" style={{ marginTop: 8 }}>Paket {PAKETE[p.paket as PaketKey].name}. Füllen Sie aus, was Sie haben. Leere Felder füllen wir mit Vorschlägen, die Sie vor dem Livegang sehen.</p>
      {fehler ? <div className="hinweis fehler abstand" role="alert">{fehler}</div> : null}
      <form action={senden} className="karte abstand" encType="multipart/form-data">
        <input type="hidden" name="token" value={token} />
        <label className="feld"><span>Ein Satz, der Ihren Betrieb beschreibt</span><input name="claim" placeholder="z. B. Bad und Heizung aus Karlsruhe, seit 1987." /></label>
        <label className="feld"><span>Kurze Vorstellung</span><textarea name="einleitung" placeholder="Was machen Sie, für wen, in welcher Gegend?" /></label>
        <label className="feld"><span>Leistungen</span><textarea name="leistungen" placeholder={"Eine Leistung pro Zeile, z. B.\nHeizung: Einbau, Wartung, Notdienst\nBad: Komplettsanierung"} /><small>Format: Name, Doppelpunkt, kurze Beschreibung.</small></label>
        <label className="feld"><span>Über uns</span><textarea name="ueberUns" placeholder="Wer steckt dahinter? Wie viele sind Sie im Team?" /></label>
        <div className="raster zwei">
          <label className="feld"><span>Telefon für Kunden</span><input name="telefon" type="tel" defaultValue={b?.telefon ?? ""} /></label>
          <label className="feld"><span>E-Mail für Anfragen</span><input name="email" type="email" defaultValue={b?.email ?? ""} /></label>
        </div>
        <label className="feld"><span>Ihre Domain</span><input name="domain" defaultValue={b?.website ?? ""} placeholder="ihr-betrieb.de" /><small>Die Domain läuft auf Ihren Namen. Haben Sie noch keine, kümmern wir uns.</small></label>
        {mitKarriere ? <label className="feld"><span>Offene Stellen</span><textarea name="stellen" placeholder={"Eine Stelle pro Zeile, z. B.\nAnlagenmechaniker SHK (m/w/d)\nAusbildung 2027"} /></label> : null}
        <label className="feld"><span>Fotos</span><input name="fotos" type="file" accept="image/*" multiple /><small>Echte Bilder aus Ihrem Betrieb: Team, Werkstatt, Baustellen. Keine Fotos von Kunden ohne deren Einverständnis.</small></label>
        <fieldset className="feld" style={{ border: "1px solid var(--rahmen)", borderRadius: 6, padding: 16 }}>
          <legend style={{ fontWeight: 600, padding: "0 6px" }}>Kurz zu Ihrem Betrieb</legend>
          <small style={{ display: "block", marginBottom: 12 }}>Damit prüfen wir, ob für Ihre Seite das Barrierefreiheitsstärkungsgesetz gilt.</small>
          <div className="raster zwei">
            <label className="feld"><span>Mitarbeitende (mit Ihnen)</span><input name="mitarbeiter" type="number" min={1} inputMode="numeric" required /></label>
            <label className="feld"><span>Jahresumsatz</span>
              <select name="umsatz" required defaultValue=""><option value="" disabled>Bitte wählen</option><option value="bis2">bis 2 Mio. €</option><option value="ueber2">über 2 Mio. €</option></select>
            </label>
          </div>
          <label className="feld"><span>Sollen Privatkunden online Termine buchen oder etwas bestellen können?</span>
            <select name="verbraucher" required defaultValue=""><option value="" disabled>Bitte wählen</option><option value="nein">Nein, nur Anfragen und Anrufe</option><option value="termin">Ja, Online-Terminbuchung</option><option value="bestellung">Ja, Bestellen oder Vertrag online</option></select>
          </label>
        </fieldset>
        <label className="feld"><span>Was ist Ihnen am wichtigsten?</span><textarea name="prioritaeten" placeholder="z. B. Mehr Anfragen mit Fotos, Azubis finden" style={{ minHeight: 80 }} /></label>
        <button className="knopf haupt">Inhalte absenden</button>
      </form>
    </>
  );
}
