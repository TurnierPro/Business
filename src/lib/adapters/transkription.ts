import fs from "node:fs";
import path from "node:path";

// Whisper läuft auf eurem eigenen Server (faster-whisper-server, OpenAI-kompatible Schnittstelle).
// Das Audio verlässt Deutschland nicht. Ohne WHISPER_URL liefert der Simulator ein Beispielgespräch.

export async function transkribiere(audioPfad: string, betrieb: { name: string; inhaber?: string | null; gewerk: string }): Promise<{ text: string; simuliert: boolean }> {
  if (process.env.WHISPER_URL) {
    const form = new FormData();
    const datei = fs.readFileSync(audioPfad);
    form.append("file", new Blob([datei]), path.basename(audioPfad));
    form.append("model", process.env.WHISPER_MODELL ?? "Systran/faster-whisper-large-v3");
    form.append("language", "de");
    const res = await fetch(`${process.env.WHISPER_URL.replace(/\/$/, "")}/v1/audio/transcriptions`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`Whisper antwortet mit ${res.status}`);
    const json = (await res.json()) as { text: string };
    return { text: json.text, simuliert: false };
  }
  const inhaber = betrieb.inhaber ?? "Inhaber";
  return {
    simuliert: true,
    text: [
      `Daniel: Danke, dass Sie sich Zeit nehmen, ${inhaber}. Darf ich das Gespräch aufnehmen? Die Aufnahme wird nach dem Protokoll gelöscht.`,
      `${inhaber}: Ja, passt.`,
      `Daniel: Wo drückt es bei ${betrieb.name} im Moment am meisten?`,
      `${inhaber}: Ehrlich gesagt beim Personal. Wir suchen seit Monaten zwei Gesellen und einen Azubi. Auf die Anzeige in der Zeitung kam fast nichts.`,
      `${inhaber}: Und das Büro. Meine Frau macht das nebenher, Anfragen kommen per Telefon, per Mail, manchmal per WhatsApp. Da geht auch mal was verloren.`,
      `Daniel: Wie kommen neue Kunden zu Ihnen?`,
      `${inhaber}: Meistens Empfehlung. Die Website ist von 2014, die hat mein Neffe gemacht. Auf dem Handy sieht die nicht gut aus.`,
      `Daniel: Wenn Sie in einem Jahr zurückschauen, was müsste passiert sein?`,
      `${inhaber}: Zwei neue Leute an Bord und weniger Zettelwirtschaft. Und Anfragen mit Fotos, damit wir nicht für jede Kleinigkeit rausfahren.`,
      `Daniel: Was wäre Ihnen bei einer neuen Seite wichtig?`,
      `${inhaber}: Echte Bilder von uns, keine Stockfotos. Und dass ich nicht ständig etwas machen muss.`,
      `Daniel: Gibt es ein Budget, das Sie im Kopf haben?`,
      `${inhaber}: Wenn es was bringt, sind fünftausend in Ordnung. Monatlich sollte es überschaubar bleiben.`,
    ].join("\n"),
  };
}
