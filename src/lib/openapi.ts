import { RECHTE } from "./api";
import { EREIGNISSE } from "./webhooks";

// Beschreibung der Schnittstelle (OpenAPI 3.1), damit n8n und andere Werkzeuge die Felder kennen.
const text = { type: "string" } as const;
const zahl = { type: "integer" } as const;
const antwortId = { "201": { description: "Angelegt", content: { "application/json": { schema: { type: "object", properties: { id: zahl } } } } } };
const fehler = { "400": { description: "Fehlerhafte Eingabe" }, "401": { description: "Schlüssel fehlt oder ungültig" }, "403": { description: "Recht fehlt" }, "429": { description: "Zu viele Anfragen" } };
const koerper = (props: Record<string, unknown>, pflicht: string[]) => ({ required: true, content: { "application/json": { schema: { type: "object", required: pflicht, properties: props } } } });
const mitRecht = (recht: string) => ({ security: [{ schluessel: [] }], "x-recht": recht, description: `Recht: ${recht} (${RECHTE[recht]})` });

export function openapi(basis: string) {
  return {
    openapi: "3.1.0",
    info: { title: "Levarex OS", version: "1", description: `Schnittstelle von Levarex OS. Anmeldung: Authorization: Bearer lvx_… Versenden ist über die Schnittstelle nicht möglich; Entwürfe gehen in den Postausgang und brauchen eine Freigabe. Webhooks: ${Object.entries(EREIGNISSE).map(([k, v]) => `${k} (${v})`).join(", ")}. Signatur im Kopf X-Levarex-Signatur = sha256=HMAC-SHA256(Geheimnis, "<X-Levarex-Zeit>.<Body>").` },
    servers: [{ url: `${basis}/api/v1` }],
    components: { securitySchemes: { schluessel: { type: "http", scheme: "bearer" } } },
    paths: {
      "/betriebe": {
        get: { summary: "Betriebe lesen", ...mitRecht("lesen"), responses: { "200": { description: "Liste" }, ...fehler } },
        post: { summary: "Lead anlegen", ...mitRecht("leads"), requestBody: koerper({ name: text, gewerk: text, inhaber: text, strasse: text, plz: text, ort: text, telefon: text, email: text, website: text, datenquelle: text }, ["name"]), responses: { ...antwortId, "409": { description: "Schon vorhanden oder gesperrt" }, ...fehler } },
      },
      "/betriebe/{id}": { get: { summary: "Betrieb mit Ansprechpartnern, Projekten, offenen Aufgaben", ...mitRecht("lesen"), parameters: [{ name: "id", in: "path", required: true, schema: zahl }], responses: { "200": { description: "Betrieb" }, "404": { description: "Nicht gefunden" }, ...fehler } } },
      "/projekte": { get: { summary: "Projekte lesen", ...mitRecht("lesen"), responses: { "200": { description: "Liste" }, ...fehler } } },
      "/kontakte": { post: { summary: "Ansprechpartner anlegen", ...mitRecht("kontakte"), requestBody: koerper({ betriebId: zahl, name: text, rolle: text, telefon: text, email: text, notiz: text }, ["betriebId", "name"]), responses: { ...antwortId, ...fehler } } },
      "/aktivitaeten": { post: { summary: "Notiz, Anruf, Termin oder Aufgabe anlegen", ...mitRecht("aktivitaeten"), requestBody: koerper({ betriebId: zahl, art: { type: "string", enum: ["notiz", "anruf", "termin", "aufgabe"] }, titel: text, text, faelligAm: { type: "string", format: "date-time" }, zustaendig: text }, ["art", "titel"]), responses: { ...antwortId, ...fehler } } },
      "/tickets": { post: { summary: "Ticket anlegen", ...mitRecht("tickets"), requestBody: koerper({ betriebId: zahl, betreff: text, beschreibung: text, kategorie: text, prioritaet: text }, ["betriebId", "betreff"]), responses: { ...antwortId, ...fehler } } },
      "/nachrichten": { post: { summary: "Nachricht einliefern (Mail, WhatsApp, Telefon, Portal, Formular)", ...mitRecht("nachrichten"), requestBody: koerper({ kanal: { type: "string", enum: ["mail", "whatsapp", "telefon", "portal", "formular"] }, absender: text, inhalt: text, betreff: text, externeId: text, name: text, betriebId: zahl, dauerSek: zahl, zeit: { type: "string", format: "date-time" }, entwurf: { type: "boolean" } }, ["kanal", "absender", "inhalt"]), responses: { ...antwortId, "200": { description: "Schon vorhanden (gleiche externeId)" }, ...fehler } } },
      "/dokumente": { get: { summary: "Unterlagen eines Betriebs", ...mitRecht("dokumente"), parameters: [{ name: "betriebId", in: "query", required: true, schema: zahl }], responses: { "200": { description: "Liste" }, ...fehler } } },
      "/dokumente/{id}": { get: { summary: "PDF einer Unterlage", ...mitRecht("dokumente"), parameters: [{ name: "id", in: "path", required: true, schema: zahl }], responses: { "200": { description: "PDF", content: { "application/pdf": {} } }, "404": { description: "Nicht gefunden" }, ...fehler } } },
      "/entwuerfe": { post: { summary: "Mail-Entwurf in den Postausgang (Versand nur nach Freigabe)", ...mitRecht("entwuerfe"), requestBody: koerper({ betriebId: zahl, empfaenger: text, betreff: text, text }, ["empfaenger", "betreff", "text"]), responses: { ...antwortId, ...fehler } } },
    },
  };
}
