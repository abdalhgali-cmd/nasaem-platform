// Audit counterexamples; only the dedicated local synthetic database is permitted.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const url = new URL(process.env.DATABASE_URL || 'http://invalid');
if (url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/nasaem_umrah_e2e') {
  throw new Error('Audit probes require the isolated localhost:55432/nasaem_umrah_e2e database');
}
const { default: db } = await import('../../backend/src/config/database.js');
const { getDraftByToken, addDraftDocument } = await import('../../backend/src/modules/intake-drafts/intake-drafts.service.js');
after(() => db.$disconnect());

test('known defect U-01: an expired anonymous draft must not disclose its data', async () => {
  const draft = await db.intakeDraft.create({ data: { token: randomUUID(), name: 'Synthetic audit only', expiresAt: new Date(0) } });
  try { assert.equal(await getDraftByToken(draft.token), null); }
  finally { await db.intakeDraft.delete({ where: { id: draft.id } }); }
});

test('known defect U-04: maxFiles=1 per TRAVELER permits one file for each of two pilgrims', async () => {
  const service = await db.service.create({ data: { code: `AUDIT-${randomUUID()}`, name: 'Synthetic audit', category: 'umrah_package', basePrice: 1 } });
  const requirement = await db.visaRequirement.create({ data: { serviceId: service.id, name: 'Synthetic passport', scope: 'TRAVELER', maxFiles: 1, ocrEnabled: false } });
  const draft = await db.intakeDraft.create({ data: { token: randomUUID(), serviceId: service.id, expiresAt: new Date(Date.now() + 60000) } });
  const file = { buffer: Buffer.from('%PDF-1.4\nsynthetic audit fixture'), originalname: 'synthetic.pdf', mimetype: 'application/pdf', size: 32 };
  try {
    const first = await addDraftDocument(draft.token, { label: 'first', file, requirementId: requirement.id, travelerIndex: 0 });
    assert.ok(first.document);
    const second = await addDraftDocument(draft.token, { label: 'second', file, requirementId: requirement.id, travelerIndex: 1 });
    assert.equal(second.error, undefined);
  } finally {
    await db.intakeDraft.delete({ where: { id: draft.id } });
    await db.service.delete({ where: { id: service.id } });
  }
});

test('known defect U-08: DB must refuse a document assigned to a traveler from another request', async () => {
  const base = { name: 'Synthetic audit', phone: '0000000000', message: 'Synthetic only' };
  const a = await db.contactRequest.create({ data: base });
  const b = await db.contactRequest.create({ data: { ...base, travelers: { create: { fullName: 'Synthetic traveler' } } }, include: { travelers: true } });
  try {
    await assert.rejects(db.contactRequestDocument.create({ data: {
      contactRequestId: a.id, travelerId: b.travelers[0].id, label: 'Synthetic mismatch',
      fileName: 'synthetic.pdf', storagePath: 'audit/nonexistent-synthetic.pdf', mimeType: 'application/pdf', sizeBytes: 1,
    } }));
  } finally {
    await db.contactRequest.delete({ where: { id: a.id } });
    await db.contactRequest.delete({ where: { id: b.id } });
  }
});
