export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { starteArbeiter } = await import("./lib/jobs/arbeiter");
    starteArbeiter();
  }
}
