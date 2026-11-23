import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { angebotMailEntwurf } from "@/lib/ablauf/verkauf";
import { euro, UST } from "@/lib/pakete";
import { SendenKnopf } from "@/components/SendenKnopf";
import { angebotMailVorlegen } from "../../../../aktionen";

export const metadata = { title: "Angebot: E-Mail schreiben" };

// Schritt 2 nach dem Speichern: Angebot ansehen, dann die E-Mail an den Kunden formulieren.
// Die E-Mail geht danach wie alles über Qualitätskontrolle und Freigabe raus.
export default async function AngebotMail({ params, searchParams }: { params: Promise<{ id: string; angebotId: string }>; searchParams: Promise<{ ok?: string; fehler?: string }> }) {
  const p = await params;
  const id = Number(p.id);
  const angebotId = Number(p.angebotId);
  if (!Number.isInteger(id) || !Number.isInteger(angebotId) || id <= 0 || angebotId <= 0) notFound();
  const { ok, fehler } = await searchParams;
  const db = await getDb();
  const [a] = await db.select().from(schema.angebote).where(and(eq(schema.angebote.id, angebotId), eq(schema.angebote.betriebId, id)));
  if (!a) notFound();
  const [b] = await db.select().from(schema.betriebe).where(eq(schema.betriebe.id, id));
  const entwurf = await angebotMailEntwurf(a.id);
  const mails = (await db.select().from(schema.postausgang).where(and(eq(schema.postausgang.betriebId, id), eq(schema.postausgang.zweck, "angebot")))).filter((m) => Number(m.meta.angebotId) === a.id && m.status !== "abgelehnt");
  const nummer = `A-${a.erstelltAm.getFullYear()}-${String(a.id).padStart(4, "0")}`;

  return (
    <>
      <Link href={`/leads/${id}`} className="zurueck">← {b?.name}</Link>
      <div className="kopfzeile"><div><h1>Angebot {nummer}</h1><p>Schritt 1 ist erledigt: Das Angebot ist gespeichert. Jetzt die E-Mail dazu schreiben, oder direkt beim Termin auf dem Tablet unterschreiben.</p></div></div>
      {ok ? <div className="hinweis ok" role="status">{ok}</div> : null}
      {fehler ? <div className="hinweis fehler" role="alert">{fehler}</div> : null}

      <section className="karte abstand-klein">
        <div className="kopfzeile" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}><span className="nr">1</span> Das Angebot</h2>
          {entwurf.angebotDokId ? <a className="knopf klein" href={`/dokument/${entwurf.angebotDokId}`} target="_blank">PDF ansehen</a> : null}
        </div>
        <div className="geldzeile">
          <div><span className="etikett">einmalig</span><b>{euro(a.einmalig)}</b></div>
          <div><span className="etikett">monatlich</span><b>{euro(a.monatlich)}</b></div>
          <div><span className="etikett">erste Rate brutto</span><b>{euro(Math.round(Math.round(a.einmalig / 2) * (1 + UST)))}</b></div>
        </div>
        <ul className="liste-schlicht" style={{ marginTop: 12 }}>
          {a.positionen.map((x) => <li key={x.text}><span>{x.text}</span><span className="leise klein">{x.einmalig ? euro(x.einmalig) : "–"} · {x.monatlich ? `${euro(x.monatlich)}/Monat` : "–"}</span></li>)}
        </ul>
        <p className="leise klein">Passt etwas nicht? <Link href={`/leads/${id}/angebot`}>Neu zusammenstellen</Link> (dieses Angebot wird dann ersetzt).</p>
      </section>

      <section className="karte abstand-klein">
        <h2><span className="nr">2</span> E-Mail an den Kunden</h2>
        {mails.length ? (
          <div className="hinweis">Die E-Mail zu diesem Angebot ist schon angelegt. <Link href={`/freigaben/${mails[0].id}`}>Zur Freigabe</Link></div>
        ) : a.status !== "entwurf" ? (
          <div className="hinweis">Das Angebot ist bereits {a.status === "unterschrieben" ? "unterschrieben" : a.status === "ueberholt" ? "durch ein neueres ersetzt" : a.status}. Eine E-Mail ist nicht mehr nötig.</div>
        ) : (
          <form action={angebotMailVorlegen} style={{ display: "grid", gap: 12 }}>
            <input type="hidden" name="betriebId" value={id} />
            <input type="hidden" name="angebotId" value={a.id} />
            <div className="raster zwei">
              <label className="feld"><span>An</span><input name="empfaenger" type="email" required defaultValue={b?.email ?? ""} placeholder="name@betrieb.de" /></label>
              <label className="feld"><span>Betreff</span><input name="betreff" required defaultValue={entwurf.betreff} /></label>
            </div>
            <label className="feld"><span>Text</span><textarea name="text" required rows={14} defaultValue={entwurf.text} /><small>Das Angebot hängt als PDF an. Die Signatur mit den Pflichtangaben setzt Levarex OS automatisch.</small></label>
            <div className="knopfreihe">
              <SendenKnopf text="Zur Freigabe vorlegen" warten="E-Mail wird angelegt …" />
              <Link className="knopf" href={`/unterschrift/${a.id}`}>Ohne E-Mail: auf dem Tablet unterschreiben</Link>
            </div>
            <p className="leise klein">Es geht noch nichts raus: Die Qualitätskontrolle prüft die E-Mail, danach gibst du sie frei.</p>
          </form>
        )}
      </section>
    </>
  );
}
