// Monatsbeitrag per SEPA-Lastschrift über Qonto (Business API, SEPA Direct Debit).
// Echt nur mit QONTO_ACCESS_TOKEN (OAuth, Bereich sepa_direct_debit.write) und QONTO_KONTO_ID, sonst Simulator.
// Ablauf: Kunde bei Qonto anlegen, wiederkehrenden Einzug (monatlich) anlegen. Ohne vorhandenes Mandat legt Qonto
// eines an und schickt dem Kunden den Link zum Unterschreiben (notify_client). Wird nur nach Freigabe im Postausgang aufgerufen.
// Voraussetzung bei Qonto: SEPA-Lastschrift für das Konto freigeschaltet (Gläubiger-ID).
// Vor dem Echtbetrieb: Feldnamen gegen docs.qonto.com prüfen (aus dieser Umgebung nicht abrufbar); bekannt aus der Doku:
// POST /v2/sepa/direct_debit_subscriptions mit { direct_debit_subscription: { client_id, bank_account_id,
// initial_collection_date, amount { value, currency }, reference, notify_client, schedule_type } }, Antwort mit sign_url.

export const QONTO_BRAUCHT = ["QONTO_ACCESS_TOKEN", "QONTO_KONTO_ID"];
export const qontoEcht = () => !!process.env.QONTO_ACCESS_TOKEN && !!process.env.QONTO_KONTO_ID;
const basis = () => (process.env.QONTO_BASIS_URL ?? "https://thirdparty.qonto.com").replace(/\/$/, "");

async function anfrage<T>(pfad: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${basis()}${pfad}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.QONTO_ACCESS_TOKEN}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Qonto ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  return (await res.json()) as T;
}

export type Lastschrift = { name: string; email: string; strasse?: string | null; plz?: string | null; ort?: string | null; betragBrutto: number; ersterEinzug: Date; referenz: string; qontoKundeId?: string | null };

/** Kunde und monatlichen Einzug anlegen. Gibt die IDs und den Link zum Mandat zurück (Simulator: Platzhalter). */
export async function lastschriftEinrichten(l: Lastschrift): Promise<{ kundeId: string; aboId: string; mandatLink: string | null; simuliert: boolean }> {
  if (!qontoEcht()) return { kundeId: l.qontoKundeId ?? `sim_kunde_${l.referenz}`, aboId: `sim_abo_${l.referenz}`, mandatLink: null, simuliert: true };
  let kundeId = l.qontoKundeId ?? null;
  if (!kundeId) {
    const k = await anfrage<{ client?: { id: string }; id?: string }>("/v2/clients", {
      method: "POST",
      body: JSON.stringify({ kind: "company", name: l.name, email: l.email, currency: "EUR", locale: "de", billing_address: { street_address: l.strasse ?? "", zip_code: l.plz ?? "", city: l.ort ?? "", country_code: "DE" } }),
    });
    kundeId = k.client?.id ?? k.id ?? null;
    if (!kundeId) throw new Error("Qonto hat keine Kunden-ID geliefert.");
  }
  const a = await anfrage<{ direct_debit_subscription?: { id: string; sign_url?: string }; id?: string; sign_url?: string }>("/v2/sepa/direct_debit_subscriptions", {
    method: "POST",
    body: JSON.stringify({
      direct_debit_subscription: {
        client_id: kundeId,
        bank_account_id: process.env.QONTO_KONTO_ID,
        initial_collection_date: l.ersterEinzug.toISOString().slice(0, 10),
        amount: { value: (l.betragBrutto / 100).toFixed(2), currency: "EUR" },
        reference: l.referenz.slice(0, 140),
        notify_client: true,
        schedule_type: "monthly",
      },
    }),
  });
  const abo = a.direct_debit_subscription ?? { id: a.id ?? "", sign_url: a.sign_url };
  if (!abo.id) throw new Error("Qonto hat keinen Einzug angelegt.");
  return { kundeId, aboId: abo.id, mandatLink: abo.sign_url ?? null, simuliert: false };
}

/** Einzug beenden (bei Vertragsende). */
export async function lastschriftBeenden(aboId: string): Promise<string> {
  if (!qontoEcht() || aboId.startsWith("sim_")) return "Simulator: Einzug beendet";
  await anfrage(`/v2/sepa/direct_debit_subscriptions/${encodeURIComponent(aboId)}/cancel`, { method: "POST" });
  return "Einzug bei Qonto beendet";
}
