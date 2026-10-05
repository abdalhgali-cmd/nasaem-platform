// Imported BEFORE the app by suites that make many auth calls from one IP in
// one process. Production limits are unchanged (see customer-auth.routes.js).
process.env.CUSTOMER_AUTH_RATE_LIMIT = "1000";
process.env.CUSTOMER_CODE_REQUEST_LIMIT = "1000";
process.env.TRACKING_CODE_REQUEST_LIMIT = "1000";
