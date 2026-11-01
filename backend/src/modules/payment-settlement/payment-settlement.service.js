// How a customer may settle an approved invoice by bank transfer, and the
// server-side check of the choice sent with a transfer receipt.
//
// An invoice is paid in its own currency, into an active agency account in
// that currency. In addition, when the agency has explicitly marked an SDG
// account «يقبل المقابل بالجنيه» (PaymentAccount.acceptsForeignInvoices), an
// invoice issued in another currency may be settled with the SDG equivalent
// that was frozen on the invoice when it was issued (Invoice.amountSdg at
// Invoice.exchangeRateToSdg) — never a rate computed now, never another
// amount. The invoice itself (amount, currency, rate) is never changed.
//
// A receipt only records what the customer says they paid; staff verify it
// against the bank before confirming (contact-requests.service.js).

const ACCOUNT_SELECT = { id: true, name: true, bankName: true, accountName: true, accountNumber: true, iban: true, currency: true, acceptsForeignInvoices: true };

function money(value) {
  return value === null || value === undefined ? null : String(value);
}

// The SDG equivalent can be offered only when it was frozen on the invoice.
export function frozenSdgEquivalent(invoice) {
  if (!invoice || invoice.currency === "SDG") return null;
  const amount = Number(invoice.amountSdg);
  const rate = Number(invoice.exchangeRateToSdg);
  if (!(amount > 0) || !(rate > 0)) return null;
  return { amount: money(invoice.amountSdg), rate: money(invoice.exchangeRateToSdg), rateFixedAt: invoice.rateFixedAt ?? null };
}

// Pure: the ways this invoice may be paid, given active agency accounts.
export function settlementOptions(invoice, accounts) {
  if (!invoice) return [];
  const options = [];
  for (const account of accounts) {
    const { acceptsForeignInvoices, ...publicAccount } = account;
    if (account.currency === invoice.currency) {
      options.push({ ...publicAccount, accountId: account.id, kind: "INVOICE_CURRENCY", payCurrency: invoice.currency, payAmount: money(invoice.amount) });
    }
  }
  const sdg = frozenSdgEquivalent(invoice);
  if (sdg) {
    for (const account of accounts) {
      if (account.currency !== "SDG" || !account.acceptsForeignInvoices) continue;
      const { acceptsForeignInvoices, ...publicAccount } = account;
      options.push({
        ...publicAccount,
        accountId: account.id,
        kind: "SDG_EQUIVALENT",
        payCurrency: "SDG",
        payAmount: sdg.amount,
        rate: sdg.rate,
        rateFixedAt: sdg.rateFixedAt,
      });
    }
  }
  return options;
}

// Active accounts that may take any of these invoices (their currencies, and SDG).
export async function loadSettlementAccounts(db, invoices) {
  const currencies = [...new Set(["SDG", ...invoices.filter(Boolean).map((invoice) => invoice.currency)])];
  return db.paymentAccount.findMany({
    where: { active: true, currency: { in: currencies } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: ACCOUNT_SELECT,
  });
}

export async function loadSettlementOptions(db, invoice) {
  if (!invoice) return [];
  return settlementOptions(invoice, await loadSettlementAccounts(db, [invoice]));
}

// What the customer pays: the approved invoice, or the offer they chose
// (offers have no version). Null when neither exists.
export function payableOf(request) {
  if (request?.invoice) return request.invoice;
  const offer = (request?.offers || []).find((candidate) => candidate.id === request.selectedOfferId);
  if (!offer) return null;
  return { amount: offer.amount, currency: offer.currency, amountSdg: offer.amountSdg ?? null, exchangeRateToSdg: offer.exchangeRateToSdg ?? null, rateFixedAt: offer.rateFixedAt ?? null, version: null };
}

// The account the customer transferred to and the invoice version shown, as
// sent in the receipt upload (multipart fields). Checked by resolveSettlement.
export function settlementChoiceOf(body = {}) {
  // Any value sent is checked against the offered accounts (a malformed one
  // is refused there, never silently treated as "no account").
  const raw = typeof body.settlementAccountId === "string" ? body.settlementAccountId.trim() : "";
  const accountId = raw ? raw.slice(0, 100) : undefined;
  const version = body.invoiceVersion === undefined || body.invoiceVersion === "" ? undefined : String(body.invoiceVersion);
  return { accountId, invoiceVersion: version };
}

// The settlement of the receipt a payment confirmation accepts: the latest
// receipt still under review that carries one.
export function settlementBeingConfirmed(request) {
  const receipts = (request?.documents || [])
    .filter((d) => d.classification === "FINANCIAL_DOCUMENT" && d.status === "PENDING" && !d.supersededAt && d.paymentSettlement)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return receipts[0]?.paymentSettlement || null;
}

function refuse(code, message) {
  return { status: 409, code, message };
}

// Inside the receipt upload's locked transaction: checks the customer's
// choice against the stored invoice and the accounts as they are now, and
// returns the snapshot stored with the receipt.
//   accountId:      the agency account the customer transferred to
//   invoiceVersion: the invoice version the payment screen showed
// A client that sends no account (older app versions) keeps working: the
// receipt is recorded as a transfer in the invoice's own currency, the only
// settlement offered before this existed.
export async function resolveSettlement(db, invoice, { accountId, invoiceVersion } = {}) {
  // Nothing priced to compare with (legacy rows): recorded as before.
  if (!invoice) return { settlement: null };
  const versioned = invoice.version !== null && invoice.version !== undefined;
  const versionSent = invoiceVersion !== undefined && invoiceVersion !== null && invoiceVersion !== "";
  // A chosen account comes with the invoice version it was shown against.
  if (versioned && ((versionSent && Number(invoiceVersion) !== invoice.version) || (accountId && !versionSent))) {
    return { refusal: refuse("INVOICE_CHANGED", "تغيّرت بيانات الفاتورة بعد أن فتحت صفحة الدفع؛ حدّث الصفحة ثم ارفع الإشعار.") };
  }
  const base = {
    invoiceAmount: money(invoice.amount),
    invoiceCurrency: invoice.currency,
    invoiceVersion: invoice.version ?? null,
    rate: money(invoice.exchangeRateToSdg),
    rateFixedAt: invoice.rateFixedAt ?? null,
  };
  if (!accountId) {
    return { settlement: { ...base, kind: "INVOICE_CURRENCY", payCurrency: invoice.currency, payAmount: money(invoice.amount), accountId: null, source: "CLIENT_WITHOUT_ACCOUNT" } };
  }
  // Hold the chosen account row until the receipt commits: an administrator
  // disabling it (or its SDG opt-in) meanwhile waits, and the options below
  // are read after any change committed before (each statement reads the
  // latest committed state).
  await db.$queryRaw`SELECT id FROM "PaymentAccount" WHERE id = ${accountId} FOR SHARE`;
  const options = await loadSettlementOptions(db, invoice);
  const option = options.find((candidate) => candidate.accountId === accountId);
  if (!option) {
    return { refusal: refuse("SETTLEMENT_ACCOUNT_INVALID", "الحساب المختار غير متاح لهذا الدفع. حدّث صفحة الدفع واختر أحد الحسابات الظاهرة.") };
  }
  return {
    settlement: {
      ...base,
      kind: option.kind,
      payCurrency: option.payCurrency,
      payAmount: option.payAmount,
      accountId: option.accountId,
      account: { bankName: option.bankName, accountName: option.accountName, accountNumber: option.accountNumber || null, iban: option.iban || null, currency: option.currency },
      source: "CUSTOMER_SELECTED",
    },
  };
}
