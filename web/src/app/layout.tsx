import type { Metadata, Viewport } from "next";
import { Cairo, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteChrome } from "@/components/layout/site-chrome";
import { siteConfig } from "@/lib/site-config";
import { getSiteAssetUrls } from "@/lib/site-assets";
import { buildThemeOverrideCss, getPublicTheme } from "@/lib/theme";
import { getPublicSiteSettings } from "@/lib/public-settings";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const publicSettings = await getPublicSiteSettings();
  const title = publicSettings.seoTitle || `${siteConfig.name} | ${siteConfig.nameEn}`;
  const description = publicSettings.seoDescription || siteConfig.description;

  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: title,
      template: `%s | ${siteConfig.shortName}`,
    },
    description,
    keywords: [
      "عمرة",
      "حج",
      "تأشيرات",
      "حجز طيران",
      "حجز فنادق",
      "نسائم الحرمين",
      "Umrah packages",
      "Sudan travel agency",
    ],
    authors: [{ name: siteConfig.nameEn }],
    openGraph: {
      type: "website",
      locale: "ar_SD",
      url: siteConfig.url,
      title,
      description,
      siteName: siteConfig.name,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0B3D91" },
    { media: "(prefers-color-scheme: dark)", color: "#060a16" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [assetUrls, theme, publicSettings] = await Promise.all([getSiteAssetUrls(), getPublicTheme(), getPublicSiteSettings()]);
  const logoUrls = { light: assetUrls.logo || undefined, dark: assetUrls["logo-dark"] || undefined };
  const themeOverrideCss = buildThemeOverrideCss(theme);

  return (
    <html
      lang="ar"
      dir="rtl"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${cairo.variable} ${inter.variable}`}
    >
      <body className="flex min-h-screen flex-col bg-background text-foreground antialiased">
        {/* Admin-configured colors (Theme settings) override the
            globals.css defaults declared above; every value was already
            validated as #RRGGBB server-side and re-checked in theme.ts. */}
        {themeOverrideCss && <style dangerouslySetInnerHTML={{ __html: themeOverrideCss }} />}
        <ThemeProvider>
          <SiteChrome logoUrls={logoUrls} publicSettings={publicSettings}>{children}</SiteChrome>
        </ThemeProvider>
      </body>
    </html>
  );
}
