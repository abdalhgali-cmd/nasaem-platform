# StatusBadge

Status badges label the state of a case, payment, document or service type with one consistent colour per meaning.

## Tone map (use exactly this; never pick a colour per screen)
| Tone class | Meaning | Statuses |
|---|---|---|
| `nh-badge--info` | New / someone on our side must look | NEW, UNDER_REVIEW, NEEDS_REVIEW, UNDER_REVIEW_PAYMENT |
| `nh-badge--warning` | Waiting on the customer | WAITING_DOCUMENTS, MISSING_DOCUMENTS, PAYMENT_PENDING, WAITING_CUSTOMER, AWAITING_TRANSFER, PARTIAL |
| `nh-badge--navy` | In progress with us or a provider | PROCESSING, READY_FOR_PROCESSING, WAITING_PROVIDER |
| `nh-badge--success` | Done, positive | APPROVED, COMPLETED, PAID, CONFIRMED, ACCEPTED, RESULTS_READY |
| `nh-badge--danger` | Negative or blocking | REJECTED, UNPAID, SUSPENDED |
| default (no tone) | Inert | CANCELLED, INACTIVE, NOT_REQUIRED, DRAFT |

Service-type tags use `--square` + `--plain` (no dot) so they never read as a status: **Egypt clearance = `nile`**, **Umrah = `gold`**, everything else `navy`.

## SLA
`nh-sla--ok | --due | --late` (from `SLA_LABEL` in `case-workspace.tsx`). Always icon + words, never colour alone: `circle-check`, `clock`, `triangle-alert`.

## Rules
- Text comes from the existing Arabic label maps (`statusLabel`, `QUEUE_LABEL`); never show the raw enum.
- One status badge per row. Tones are told apart by the label text and lightness, not hue alone.
- Tokens: each tone's `*-soft` ground with its `*-ink` text (≥5.7:1 in both themes).
