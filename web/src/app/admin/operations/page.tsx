import { permanentRedirect } from "next/navigation";

// Kept for bookmarks and old links: the Operations Center is /admin now.
export default function OperationsPage() {
  permanentRedirect("/admin");
}
