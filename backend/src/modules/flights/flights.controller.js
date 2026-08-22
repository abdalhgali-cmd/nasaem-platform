import XLSX from "xlsx";
import {
  createManualFlight,
  deleteManualFlight,
  getCurrencyRates,
  listManualFlights,
  searchManualFlights,
  updateCurrencyRates,
  updateManualFlight,
} from "./flights.service.js";
import { searchTripFlights } from "./trip.provider.js";

export async function searchFlights(req, res, next) {
  try {
    const tripType = String(req.query.tripType || "ONE_WAY").toUpperCase();
    const travelers = Math.max(1, Number(req.query.travelers || req.query.guests || 1));
    let legs;
    try {
      legs = req.query.legs ? JSON.parse(req.query.legs) : [{ from: req.query.from, to: req.query.to, departureDate: req.query.date }];
    } catch {
      return res.status(400).json({ success: false, message: "Invalid legs JSON" });
    }
    if (!Array.isArray(legs) || !legs.length || legs.some((leg) => !leg.from || !leg.to || !leg.departureDate)) {
      return res.status(400).json({ success: false, message: "Each flight leg requires from, to and departureDate" });
    }
    if (tripType === "ROUND_TRIP" && legs.length === 1) {
      if (!req.query.returnDate) return res.status(400).json({ success: false, message: "returnDate is required for round trip" });
      legs = [legs[0], { from: legs[0].to, to: legs[0].from, departureDate: req.query.returnDate }];
    }

    const manual = await searchManualFlights(legs);
    const trip = await searchTripFlights({ legs, travelers });
    const allLegs = legs.map((_, index) => ({
      leg: index + 1,
      manual: manual[index] ?? [],
      trip: trip.legs[index] ?? [],
    }));

    return res.json({ success: true, tripConfigured: trip.configured, tripType, travelers, currency: "SDG", legs: allLegs });
  } catch (error) {
    next(error);
  }
}

export async function getFlights(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const result = await listManualFlights({ page, limit, activeOnly: req.query.activeOnly === "true" });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function postFlight(req, res, next) {
  try {
    const flight = await createManualFlight(req.body);
    res.status(201).json({ success: true, data: flight });
  } catch (error) {
    next(error);
  }
}

export async function patchFlight(req, res, next) {
  try {
    const flight = await updateManualFlight(req.params.id, req.body);
    if (!flight) return res.status(404).json({ success: false, message: "Flight not found" });
    res.json({ success: true, data: flight });
  } catch (error) {
    next(error);
  }
}

export async function removeFlight(req, res, next) {
  try {
    await deleteManualFlight(req.params.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function getRates(req, res, next) {
  try {
    res.json({ success: true, data: await getCurrencyRates() });
  } catch (error) {
    next(error);
  }
}

export async function patchRates(req, res, next) {
  try {
    res.json({ success: true, data: await updateCurrencyRates(req.body) });
  } catch (error) {
    next(error);
  }
}

export async function importExcel(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Excel file is required" });
    const workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!rows.length) return res.status(400).json({ success: false, message: "Excel file is empty" });

    const results = { imported: 0, failed: 0, errors: [] };
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      try {
        await createManualFlight({
          airline: row.airline ?? row["شركة الطيران"],
          flightNumber: row.flight_number ?? row["رقم الرحلة"],
          originCode: row.origin_code ?? row["رمز المغادرة"],
          originName: row.origin ?? row.origin_name ?? row["من"],
          destinationCode: row.destination_code ?? row["رمز الوصول"],
          destinationName: row.destination ?? row.destination_name ?? row["إلى"],
          departureAt: row.departure_at ?? row.departure_date ?? row["تاريخ ووقت المغادرة"],
          arrivalAt: row.arrival_at ?? row.arrival_date ?? row["تاريخ ووقت الوصول"],
          durationMinutes: row.duration_minutes ?? row["المدة بالدقائق"],
          stops: row.stops ?? row["التوقفات"] ?? 0,
          baggage: row.baggage ?? row["الأمتعة"],
          cabin: row.cabin ?? row["الدرجة"],
          price: row.price ?? row["السعر"],
          currency: row.currency ?? row["العملة"] ?? "USD",
          availableSeats: row.available_seats ?? row["المقاعد"] ?? null,
          externalRef: row.external_ref ?? row["المرجع"],
        });
        results.imported += 1;
      } catch (error) {
        results.failed += 1;
        results.errors.push({ row: index + 2, message: error.message });
      }
    }
    res.status(201).json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
}

export function downloadExcelTemplate(req, res) {
  const rows = [{
    airline: "TARCO",
    flight_number: "3T202",
    origin_code: "PZU",
    origin: "Port Sudan",
    destination_code: "JED",
    destination: "Jeddah",
    departure_at: "2026-08-29T08:30:00+02:00",
    arrival_at: "2026-08-29T11:30:00+02:00",
    duration_minutes: 180,
    stops: 0,
    baggage: "30 KG",
    cabin: "Economy",
    price: 1250000,
    currency: "SDG",
    available_seats: 20,
    external_ref: "",
  }];
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Flights");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.setHeader("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("content-disposition", 'attachment; filename="nasaem-flights-template.xlsx"');
  res.send(buffer);
}
