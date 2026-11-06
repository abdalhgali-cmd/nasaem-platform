// Railway healthcheck for the website service (web/railway.json): answers
// once the Next.js server is up. It never calls the API, so a slow API does
// not restart the website.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", service: "nasaem-website" }, { headers: { "Cache-Control": "no-store" } });
}
