# Stage 5 — Visa Intake

- Public visa types are backed by the real `VisaType` catalog and linked to their parent `Service` records.
- Each visa card deep-links to the existing intake wizard with the selected `VisaType.code` preserved.
- The intake wizard shows a visa-specific document checklist for Umrah, family visit, work, international, and Egypt security-clearance requests.
- Submitted visa requests preserve `visaTypeId`, the parent `serviceId`, traveler count, traveler intake data, and uploaded documents through the existing contact-request workflow.
- Existing tracking, staff review, invoices/offers, payment, activity logs, notifications, and deliverables continue to operate on the same request record.
- No live visa issuance status is fabricated; the platform remains a request/intake and operations workflow.
