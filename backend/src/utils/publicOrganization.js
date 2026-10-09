// The organization behind the public channels (web contact form, mobile app
// for guests, phone-OTP tracking). Server configuration only: never taken
// from a request. Requests submitted without an account are stored under it,
// and phone-OTP tracking can only ever see requests of this organization.
export function publicOrganizationId() {
  return process.env.PUBLIC_ORGANIZATION_ID || "org_nasaem_default";
}

// WHERE clause for "requests this verified phone may see over tracking".
export function trackingScope(phoneNormalized) {
  return { phoneNormalized, organizationId: publicOrganizationId() };
}
