// Rechnungen und E-Rechnung über Lexware Office (früher lexoffice). Echt nur mit LEXWARE_API_KEY, sonst Simulator:
// dann gelten die eigenen Rechnungsnummern und PDFs von Levarex OS.
// Angelegt wird erst beim Versand nach Freigabe, und zwar gleich endgültig (finalize=true): Lexware vergibt die Nummer,
// das PDF von Lexware geht an den Kunden. Entwürfe lassen sich über die API nicht nachträglich festschreiben.
// Feste Dienst-Adresse, deshalb normales fetch. Grenze laut Lexware: 2 Anfragen je Sekunde.
// Vor dem Echtbetrieb: Feldnamen gegen developers.lexware.io prüfen (aus dieser Umgebung nicht abrufbar).

export const LEXWARE_BRAUCHT = ["LEXWARE_API_KEY"];
export const lexwareEcht = () => !!process.env.LEXWARE_API_KEY;
const basis = () => (process.env.LEXWARE_BASIS_URL ?? "https://api.lexware.io").replace(/\/$/, "");

export type LexwareRechnung = {
  an: { name: string; strasse?: string | null; plz?: string | null; ort?: string | null };
  positionen: { text: string; netto: number }[]; // Cent
  datum: Date;
  leistung?: string;
  zahlungszielTage: number;
  titel: string;
  hinweis?: string;
};

let letzter = 0;
async function anfrage(pfad: string, init: RequestInit & { pdf?: boolean } = {}): Promise<Response> {
  // höchstens 2 Anfragen je Sekunde
  const warten = letzter + 550 - Date.now();
  if (warten > 0) await new Promise((r) => setTimeout(r, warten));
  letzter = Date.now();
  const res = await fetch(`${basis()}${pfad}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.LEXWARE_API_KEY}`, Accept: init.pdf ? "application/pdf" : "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Lexware ${res.status}: ${t.slice(0, 300)}`);
  }
  return res;
}

const euro = (cent: number) => Math.round(cent) / 100;

/** Endgültige Rechnung in Lexware anlegen. Gibt Lexware-ID, Rechnungsnummer und PDF zurück. */
export async function rechnungAnlegen(r: LexwareRechnung): Promise<{ id: string; nummer: string; pdf: Buffer }> {
  const tag = r.datum.toISOString().slice(0, 10) + "T00:00:00.000+01:00";
  const body = {
    voucherDate: tag,
    address: { name: r.an.name, street: r.an.strasse ?? undefined, zip: r.an.plz ?? undefined, city: r.an.ort ?? undefined, countryCode: "DE" },
    lineItems: r.positionen.map((p) => ({ type: "custom", name: p.text.slice(0, 255), quantity: 1, unitName: "Pauschale", unitPrice: { currency: "EUR", netAmount: euro(p.netto), taxRatePercentage: 19 } })),
    totalPrice: { currency: "EUR" },
    taxConditions: { taxType: "net" },
    shippingConditions: { shippingType: "service", shippingDate: tag },
    paymentConditions: { paymentTermLabel: `Zahlbar innerhalb von ${r.zahlungszielTage} Tagen ohne Abzug`, paymentTermDuration: r.zahlungszielTage },
    title: "Rechnung",
    introduction: r.titel,
    remark: [r.leistung ? `Leistung: ${r.leistung}` : "", r.hinweis ?? ""].filter(Boolean).join("\n") || undefined,
  };
  const angelegt = (await (await anfrage("/v1/invoices?finalize=true", { method: "POST", body: JSON.stringify(body) })).json()) as { id: string };
  const rechnung = (await (await anfrage(`/v1/invoices/${encodeURIComponent(angelegt.id)}`)).json()) as { voucherNumber?: string };
  const dok = (await (await anfrage(`/v1/invoices/${encodeURIComponent(angelegt.id)}/document`)).json()) as { documentFileId?: string };
  if (!dok.documentFileId) throw new Error("Lexware hat kein PDF geliefert.");
  const pdf = Buffer.from(await (await anfrage(`/v1/files/${encodeURIComponent(dok.documentFileId)}`, { pdf: true })).arrayBuffer());
  if (pdf.subarray(0, 4).toString() !== "%PDF") throw new Error("Lexware: Antwort ist kein PDF.");
  return { id: angelegt.id, nummer: rechnung.voucherNumber ?? angelegt.id, pdf };
}

/** Zahlstatus einer Lexware-Rechnung: bezahlt, offen oder storniert. */
export async function rechnungStatus(id: string): Promise<"bezahlt" | "offen" | "storniert"> {
  const r = (await (await anfrage(`/v1/invoices/${encodeURIComponent(id)}`)).json()) as { voucherStatus?: string };
  return r.voucherStatus === "paid" || r.voucherStatus === "paidoff" ? "bezahlt" : r.voucherStatus === "voided" ? "storniert" : "offen";
}
