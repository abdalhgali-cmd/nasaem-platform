// Airport / city picker for the flight forms: suggestions come from the
// agency's airport directory (GET /airports/search); a three-letter IATA
// code typed by hand is accepted as well. Nothing is invented locally.
import { api } from "./api.js";

const IATA = /^[A-Za-z]{3}$/;

export function airportLabel(airport) {
  const city = airport.cityAr || airport.cityEn || "";
  const name = airport.nameAr || airport.nameEn || "";
  return `${airport.iataCode} — ${[city, name].filter(Boolean).join("، ")}`;
}

// "KRT — الخرطوم، ..." or "krt" -> "KRT"; anything else -> null.
export function resolveAirportCode(value, known = new Map()) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (known.has(text)) return known.get(text);
  const head = text.split(/\s|—|-/)[0];
  if (IATA.test(head) && /—/.test(text)) return head.toUpperCase();
  return IATA.test(text) ? text.toUpperCase() : null;
}

export async function searchAirports(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];
  const res = await api(`/airports/search?q=${encodeURIComponent(q)}&limit=8`);
  return Array.isArray(res.data) ? res.data.filter((airport) => airport.iataCode) : [];
}

// Wires an <input list="..."> + <datalist> pair. Returns { code() } so the form
// can read the resolved IATA code (or null when the text is not a valid choice).
export function attachAirportPicker(input, datalist) {
  const known = new Map();
  let timer = 0;
  let seq = 0;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const mine = ++seq;
      try {
        const airports = await searchAirports(input.value);
        if (mine !== seq) return;
        known.clear();
        datalist.innerHTML = "";
        for (const airport of airports) {
          const label = airportLabel(airport);
          known.set(label, airport.iataCode.toUpperCase());
          const option = document.createElement("option");
          option.value = label;
          datalist.appendChild(option);
        }
      } catch {
        // Suggestions are a convenience: typing a 3-letter code still works offline.
      }
    }, 250);
  });
  return { code: () => resolveAirportCode(input.value, known) };
}
