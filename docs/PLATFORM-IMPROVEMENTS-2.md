# Nasaem Platform 2.0 — Execution Checklist

## Goal
Reduce staff clicks, enforce a single service workflow, and make payment/document handling operationally explicit without changing the flight integration or adding Trip.com.

## Batch 1 — Operations
- [x] Unified operations queue
- [x] Next-action classification
- [x] Stalled-request age tracking
- [x] Queue counters
- [x] Staff-safe operations API
- [ ] Assignment action from operations center
- [ ] Search/filter controls in UI

## Batch 2 — Workflow
- [ ] Define canonical lifecycle states
- [ ] Enforce legal transitions server-side
- [ ] Block issuance before confirmed payment and required documents
- [ ] Audit every state transition

## Batch 3 — Payments & Documents
- [ ] Payment amount/balance summary
- [ ] Payment rejection reason
- [ ] Receipt review action
- [ ] Required-document checklist
- [ ] Delivery readiness guard

## Batch 4 — Automation
- [ ] Notification event map
- [ ] Customer 360 summary
- [ ] Financial reporting with supplier cost
- [ ] Group/Umrah batch readiness

## Batch 5 — Quality
- [ ] Mobile-first operation actions
- [ ] Performance indexes/pagination review
- [ ] Security review
- [ ] End-to-end workflow tests
- [ ] Single final production verification

## Constraints
- Do not modify Trip.com integration.
- Do not change the flight system unless required to fix a regression.
- Avoid unnecessary production deployments while the Vercel deployment limit is active.
- Do not declare production-ready until the final end-to-end verification passes.
