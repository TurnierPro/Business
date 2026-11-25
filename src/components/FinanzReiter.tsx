/** Fortschrittsbalken mit Wort, nie nur Farbe. */
export function Fortschritt({ ist, ziel, format }: { ist: number; ziel: number; format: (n: number) => string }) {
  const anteil = ziel > 0 ? Math.max(0, Math.min(1, ist / ziel)) : 0;
  const fehlt = Math.max(0, ziel - ist);
  // Ohne Soll gibt es nichts zu „erreichen“ (sonst stünde „4.230 € von 0 € · 0 % · erreicht“)
  if (ziel <= 0) return <div className="klein leise"><span className="mono">{format(ist)}</span> · kein Soll für diesen Zeitraum</div>;
  return (
    <div>
      <div className="balken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(anteil * 100)}><span style={{ width: `${anteil * 100}%` }} /></div>
      <div className="klein leise" style={{ marginTop: 6 }}>
        <span className="mono">{format(ist)}</span> von <span className="mono">{format(ziel)}</span> · {Math.round(anteil * 100)} %{fehlt ? <> · noch <span className="mono">{format(fehlt)}</span></> : " · erreicht"}
      </div>
    </div>
  );
}
