// Imported before the app by test files that submit many public requests
// from one process: raises only the anonymous-submission limit (the same
// env knob the browser E2E environment uses). The OTP limits are untouched.
process.env.PUBLIC_CONTACT_RATE_LIMIT = process.env.PUBLIC_CONTACT_RATE_LIMIT || "100";
