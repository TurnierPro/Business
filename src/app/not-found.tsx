import Link from "next/link";

export default function NichtGefunden() {
  return (
    <div className="zentriert"><div className="schmal karte"><h1>Nicht gefunden</h1><p style={{ marginTop: 12 }}>Diese Seite gibt es nicht oder nicht mehr.</p><Link className="knopf" href="/">Zur Startseite</Link></div></div>
  );
}
