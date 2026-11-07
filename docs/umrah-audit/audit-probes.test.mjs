// Synthetic audit probes. No database, network, customer data, or writes.
// The final assertion describes the required behavior and exposes a known defect.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateUmrahDelivery, umrahTicketBooking } from '../../backend/src/modules/umrah/umrah-delivery.js';

const request = (kind = 'VISA_ONLY') => ({
  id: 'audit-request', serviceRef: { category: 'umrah_package', features: [`KIND: ${kind}`] },
  travelers: [{ id: 'audit-a' }, { id: 'audit-b' }],
  deliverables: [{ id: 'audit-visa-a', kind: 'VISA', publishedAt: '2026-11-06T00:00:00Z', travelerIds: ['audit-a'] }],
});
function allVisas(r) {
  r.deliverables.push({ id: 'audit-visa-b', kind: 'VISA', publishedAt: '2026-11-06T00:00:00Z', travelerIds: ['audit-b'] });
  return r;
}
test('partial visas do not complete a two-pilgrim request', () => {
  const result = evaluateUmrahDelivery(request());
  assert.equal(result.complete, false);
  assert.deepEqual(result.visas.missingTravelerIds, ['audit-b']);
});
test('visa-only completes with every visa and does not require tickets', () => {
  const r = allVisas(request());
  assert.equal(evaluateUmrahDelivery(r).complete, true);
  assert.equal(evaluateUmrahDelivery(r).servicesRequired, false);
  assert.equal(umrahTicketBooking(r).available, true);
});
for (const kind of ['AIR', 'SEA']) {
  test(`${kind} requires services for every pilgrim`, () => {
    const r = allVisas(request(kind));
    assert.equal(evaluateUmrahDelivery(r).complete, false);
    r.deliverables.push({ id: 'audit-services', kind: 'SERVICE', publishedAt: '2026-11-06T00:00:00Z', travelerIds: ['audit-a', 'audit-b'] });
    assert.equal(evaluateUmrahDelivery(r).complete, true);
  });
}
test('known defect U-02: editing the catalog must not change an existing request obligation', () => {
  const r = allVisas(request('AIR'));
  const before = evaluateUmrahDelivery(r).complete;
  r.serviceRef.features = ['KIND: VISA_ONLY'];
  assert.equal(evaluateUmrahDelivery(r).complete, before);
});
