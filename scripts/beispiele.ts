export {};
// Lädt die Beispieldaten in die lokale Datenbank: npm run beispiele
const { beispieleLaden } = await import("../src/lib/beispiele");
console.log(await beispieleLaden());
process.exit(0);
