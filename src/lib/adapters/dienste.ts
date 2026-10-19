// Übersicht aller Fremddienste. Ein Dienst ist "echt", sobald seine Zugangsdaten gesetzt sind.
// Bis dahin übernimmt ein Simulator, und nichts verlässt das System.

export type Dienst = { key: string; name: string; zweck: string; echt: boolean; hinweis: string };

export function dienste(): Dienst[] {
  const e = process.env;
  return [
    { key: "ki", name: "Claude (Anthropic)", zweck: "Texte, Research, Protokolle", echt: !!e.ANTHROPIC_API_KEY, hinweis: "ANTHROPIC_API_KEY setzen. Vorher EU-Verarbeitung und AV-Vertrag klären." },
    { key: "mail", name: e.RESEND_API_KEY ? "E-Mail (Resend)" : "E-Mail (Resend oder SMTP)", zweck: "Versand aus dem Postausgang", echt: !!(e.RESEND_API_KEY || e.SMTP_HOST), hinweis: "RESEND_API_KEY und MAIL_FROM setzen (Domain bei Resend bestätigen: SPF, DKIM). Alternativ SMTP_*." },
    { key: "post", name: "Briefdienst", zweck: "Akquise-Briefe drucken und versenden", echt: !!e.BRIEFDIENST_API_KEY, hinweis: "Anbieter wählen (Modul 7), dann Adapter in src/lib/adapters/post.ts ergänzen." },
    { key: "signatur", name: "E-Signatur (Docuseal)", zweck: "Angebote unterschreiben", echt: !!e.DOCUSEAL_URL, hinweis: "Docuseal auf Hetzner starten, DOCUSEAL_URL und DOCUSEAL_TOKEN setzen." },
    { key: "zahlung", name: "Stripe", zweck: "Anzahlung im Portal, Rechnungen, Schlusszahlung, Betreuungs-Abo", echt: !!e.STRIPE_SECRET_KEY, hinweis: "STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_STEUERSATZ_ID setzen. Zum Üben Testmodus-Schlüssel (sk_test_…)." },
    { key: "buchhaltung", name: "lexoffice", zweck: "Rechnungen, E-Rechnung", echt: !!e.LEXOFFICE_API_KEY, hinweis: "Mit Steuerberater abstimmen, dann LEXOFFICE_API_KEY setzen." },
    { key: "transkription", name: "Whisper (eigener Server)", zweck: "Vor-Ort-Termine in Text", echt: !!e.WHISPER_URL, hinweis: "faster-whisper-server auf Hetzner starten, WHISPER_URL setzen." },
    { key: "dns", name: "DNS-Abfrage und Domain-Umzug", zweck: "Bestandsaufnahme alter Domains, Umstellung prüfen, Zertifikate", echt: !!e.SERVER_IP, hinweis: "SERVER_IP (öffentliche IPv4 des Hetzner-Servers) setzen. Test-Domains (.example) laufen immer im Simulator." },
    { key: "push", name: "ntfy (Push aufs Handy)", zweck: "Warnungen und Tagesbericht", echt: !!e.NTFY_URL, hinweis: "ntfy auf Hetzner oder ntfy.sh, NTFY_URL mit Thema setzen." },
  ];
}

export function istEcht(key: string): boolean {
  return dienste().find((d) => d.key === key)?.echt ?? false;
}
