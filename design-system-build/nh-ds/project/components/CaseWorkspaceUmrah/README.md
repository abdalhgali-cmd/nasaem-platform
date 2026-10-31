# CaseWorkspaceUmrah

The Umrah variant of the case workspace (UM-DEMO-1192): a family of three travelling with a group, one passport pending review and the payment receipt waiting for the accountant. Same layout, rules and permissions as CaseWorkspace; see its README. All data is synthetic demonstration data.

## Status: APPROVED visual direction (31 Oct 2026)
The current Umrah case workspace is the approved baseline. The three requirements below are **mandatory for implementation**. None of them exists in the backend today (no sponsor fields, no Umrah package type), so each needs its own data, API and permission review before build. The preview does not show them yet.

## Mandatory implementation requirements
**U1. Sponsor (الكفيل): Iqama and sponsor number, with review status.**
- Per case (or per traveler where the sponsor differs): **رقم الكفيل** (sponsor number) and **إقامة الكفيل** (sponsor's Iqama, an uploaded document).
- Both carry a review status like other documents: قيد المراجعة / مقبول / مرفوض with a reason sent to the customer. They appear in "المسافرون والمستندات" as a **الكفيل** block above the travelers, and the sponsor number shows in the case header facts.
- They count toward "المستندات المطلوبة مكتملة" only where the package requires a sponsor (backend rule, not UI).
- Sensitive personal data: mask the Iqama number in lists (show the last 4 digits) and show it in full only inside the case.

**U2. Different workflows for visa-only, air and sea packages.** The case carries a package type, and the stage track, required documents and deliverables follow it:
- **تأشيرة فقط**: received, documents, payment, sent for visa, visa issued, visa delivered. No travel or booking steps.
- **جوي**: the visa steps, then flight booking, accommodation, travel with the group. Deliverables include tickets and accommodation.
- **بحري**: the visa steps, then ferry booking (existing ferries module), accommodation, travel by sea. Deliverables include the ferry ticket.
- The header's "طريقة السفر" fact and the side "المجموعة والسفر" card switch by type. Steps that don't apply are not shown, rather than shown as skipped.

**U3. Payment and readiness states enforced by real backend rules.**
- Every payment and readiness state on screen comes from the server (the readiness engine: documentsComplete, answersComplete, paymentReady, plus the confirmed payment status). The UI never computes or assumes readiness.
- Buttons such as "إرسال الحالة إلى الجهة" are enabled only when the server reports readiness, and the server rejects the action when it is not ready, even if a client sends it.
- Payment shows only server states (لم يُدفع، بانتظار التحويل، إيصال قيد المراجعة، مدفوع، جزئي). Confirmation stays on the Payment Review page for the roles allowed today.
- Package-specific rules from U2 (e.g. sponsor required, ferry booking before travel) are enforced in the same server readiness check.
