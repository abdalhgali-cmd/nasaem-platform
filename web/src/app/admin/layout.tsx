import type { Metadata } from "next";
import "./admin-theme.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// `.nh-admin` scopes the admin design tokens (admin-theme.css) to /admin/*.
// The public website and its Appearance (المظهر) colour overrides are not
// affected; inside this wrapper the admin keeps its own fixed branding.
export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="nh-admin flex min-h-screen flex-1 flex-col">{children}</div>;
}
