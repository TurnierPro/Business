import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { zugangAnfordern } from "@/lib/kundenportal";
import { clientIp, erlaubt, GRENZEN, versuchMerken } from "@/lib/sicherheit";

export const metadata = { title: "Kundenportal: Zugang", robots: { index: false } };

async function anfordern(f: FormData) {
  "use server";
  const ip = clientIp(await headers());
  if (await erlaubt("formular", `zugang:${ip}`, GRENZEN.formularJeIp)) {
    await versuchMerken("formular", `zugang:${ip}`);
    await zugangAnfordern(String(f.get("email") ?? ""));
  }
  redirect("/portal?gesendet=1");
}

// Einstieg ohne Link: Zugang per E-Mail anfordern. Kein Passwort, nichts zu merken.
export default async function PortalStart({ searchParams }: { searchParams: Promise<{ gesendet?: string }> }) {
  const { gesendet } = await searchParams;
  return (
    <>
      <h1>Ihr Kundenportal</h1>
      <p className="leise" style={{ marginTop: 8 }}>Ihren persönlichen Zugang finden Sie in jeder E-Mail von uns. Link nicht mehr zur Hand? Geben Sie die E-Mail-Adresse ein, die Sie uns genannt haben.</p>
      {gesendet ? (
        <div className="hinweis ok abstand" role="status">Danke. Wenn die Adresse bei uns hinterlegt ist, bekommen Sie Ihren Link in Kürze per E-Mail (spätestens am nächsten Werktag).</div>
      ) : (
        <form action={anfordern} className="karte abstand">
          <label className="feld"><span>Ihre E-Mail-Adresse</span><input name="email" type="email" autoComplete="email" required /></label>
          <button className="knopf haupt">Zugang anfordern</button>
        </form>
      )}
    </>
  );
}
