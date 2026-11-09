// Synthetic performance baseline for the staff Umrah list (T14). It creates
// SYNTHETIC rows tagged PERF-<run>, measures the list service, and removes
// exactly the rows it created. It refuses to run unless DATABASE_URL points at
// a local database whose name marks it as disposable, so it can never touch
// real data.
//
//   DATABASE_URL=postgresql://postgres@127.0.0.1:55432/nasaem_umrah_t02 \
//     node src/scripts/perf-umrah-list.js [--requests=2000] [--travelers=3] [--json]
//
// Reports wall time (p50/p95/max, ms) and heap growth per call, plus the
// query plan (EXPLAIN ANALYZE, BUFFERS) of the list's main row query. No customer data is read or printed.
import { performance } from "node:perf_hooks";

const arg = (name, fallback) => Number((process.argv.find((a) => a.startsWith(`--${name}=`)) || "").split("=")[1]) || fallback;

export function assertDisposableTarget(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  const local = ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
  const name = parsed.pathname.replace(/^\//, "");
  if (!local || !/(test|audit|e2e|perf|t02|restore)/i.test(name)) {
    throw new Error(`Refusing to run: ${parsed.hostname}/${name} is not a local disposable database.`);
  }
}

export function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function main() {
  assertDisposableTarget(process.env.DATABASE_URL || "");
  const requests = arg("requests", 2000);
  const travelersEach = arg("travelers", 3);
  const asJson = process.argv.includes("--json");
  const run = Date.now().toString(36);
  const tag = `PERF-${run}`;

  const { PrismaClient } = (await import("@prisma/client")).default;
  const prisma = new PrismaClient();
  // The list service imports the shared client; point it at the same database.
  const { listContactRequests, refreshUmrahQueueEntry } = await import("../modules/contact-requests/contact-requests.service.js");
  const organization = (await prisma.contactRequest.findFirst({ select: { organizationId: true } }))?.organizationId || "org_nasaem_default";

  const service = await prisma.service.create({ data: { code: `${tag}-SVC`, name: `${tag} package`, category: "UMRAH_PACKAGE", basePrice: 1000, currency: "SAR", features: ["KIND: AIR"] } });
  try {
    const now = Date.now();
    const rows = Array.from({ length: requests }, (_, i) => ({
      id: `${tag}-${i}`,
      organizationId: organization,
      name: `${tag} customer ${i}`,
      phone: `0900${String(i).padStart(6, "0")}`,
      phoneNormalized: `24990${String(i).padStart(7, "0")}`,
      message: tag,
      serviceId: service.id,
      requestKind: "SERVICE_APPLICATION",
      paymentStatus: ["AWAITING_TRANSFER", "UNDER_REVIEW", "CONFIRMED", "NOT_REQUIRED"][i % 4],
      travelerCount: travelersEach,
      intakeData: { umrahTravel: { preferredDate: `2027-0${(i % 9) + 1}-1${i % 9}`, provisional: true } },
      createdAt: new Date(now - i * 60_000),
    }));
    await prisma.contactRequest.createMany({ data: rows });
    await prisma.traveler.createMany({ data: rows.flatMap((r) => Array.from({ length: travelersEach }, (_, k) => ({ contactRequestId: r.id, fullName: `${tag} pilgrim ${k}`, sortOrder: k }))) });
    await prisma.contactRequestDocument.createMany({
      data: rows.flatMap((r) => Array.from({ length: travelersEach }, (_, k) => ({ contactRequestId: r.id, label: "passport", fileName: "p.pdf", storagePath: `contact-request-documents/${tag}-${r.id}-${k}.pdf`, mimeType: "application/pdf", sizeBytes: 10, status: k % 2 ? "ACCEPTED" : "PENDING" }))),
    });

    // The queue cache is derived per request, as it is when requests change.
    const indexStart = performance.now();
    for (let i = 0; i < rows.length; i += 25) await Promise.all(rows.slice(i, i + 25).map((r) => refreshUmrahQueueEntry(r.id)));
    const indexMs = Math.round(performance.now() - indexStart);

    const scenarios = {
      "default page 1 (limit 20)": { page: 1, limit: 20, skip: 0 },
      "default page 5 (limit 100)": { page: 5, limit: 100, skip: 400 },
      "sort=queue page 1 (limit 20)": { page: 1, limit: 20, skip: 0, sort: "queue" },
      "sort=queue page 3 (limit 100)": { page: 3, limit: 100, skip: 200, sort: "queue" },
      "sort=queue deep page (limit 100)": { page: Math.max(1, Math.ceil(requests / 100) - 1), limit: 100, skip: Math.max(0, (Math.ceil(requests / 100) - 2) * 100), sort: "queue" },
      "sort=travel page 1 (limit 20)": { page: 1, limit: 20, skip: 0, sort: "travel" },
      "stage filter (limit 100)": { page: 1, limit: 100, skip: 0, stage: "PAYMENT_REVIEW" },
    };
    const results = [];
    for (const [label, params] of Object.entries(scenarios)) {
      const times = [];
      let heap = 0;
      let meta = null;
      for (let i = 0; i < 12; i++) {
        const before = process.memoryUsage().heapUsed;
        const start = performance.now();
        const res = await listContactRequests({ organizationId: organization, serviceKind: "UMRAH", search: tag, ...params });
        times.push(performance.now() - start);
        heap = Math.max(heap, process.memoryUsage().heapUsed - before);
        meta = res.meta;
      }
      results.push({ scenario: label, p50: +percentile(times, 50).toFixed(1), p95: +percentile(times, 95).toFixed(1), max: +Math.max(...times).toFixed(1), peakHeapDeltaMB: +(heap / 1048576).toFixed(1), total: meta?.total, truncated: meta?.truncated ?? false });
    }
    const plan = await prisma.$queryRawUnsafe(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT id FROM "ContactRequest" WHERE "organizationId" = $1 AND "message" = $2 ORDER BY "createdAt" DESC, id DESC LIMIT 20`,
      organization,
      tag
    );
    const planLines = plan.map((row) => row["QUERY PLAN"]);
    const out = { requests, travelersEach, indexBuildMs: indexMs, results, plan: planLines };
    if (asJson) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(`synthetic requests: ${requests}, pilgrims each: ${travelersEach}, queue entries derived in ${indexMs} ms`);
      console.log("\nplan of the default row query:\n" + planLines.join("\n"));
      for (const r of results) console.log(`${r.scenario.padEnd(34)} p50 ${r.p50}ms  p95 ${r.p95}ms  max ${r.max}ms  heap+${r.peakHeapDeltaMB}MB  total ${r.total}${r.truncated ? " (truncated)" : ""}`);
    }
  } finally {
    await prisma.contactRequestDocument.deleteMany({ where: { storagePath: { startsWith: `contact-request-documents/${tag}-` } } });
    await prisma.traveler.deleteMany({ where: { contactRequestId: { startsWith: `${tag}-` } } });
    await prisma.contactRequest.deleteMany({ where: { id: { startsWith: `${tag}-` } } });
    await prisma.service.delete({ where: { id: service.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
