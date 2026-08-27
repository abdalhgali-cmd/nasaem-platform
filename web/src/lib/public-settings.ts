import { API_URL } from "./api-url";
import { siteConfig } from "./site-config";

export type PublicSiteSettings = {
  phone: string;
  email: string;
  address: string;
  whatsapp: string;
  social: { facebook: string; instagram: string; twitter: string };
  seoTitle: string;
  seoDescription: string;
};

type Setting = { key: string; value: string };

const defaults: PublicSiteSettings = {
  phone: siteConfig.phone,
  email: siteConfig.email,
  address: siteConfig.address,
  whatsapp: siteConfig.whatsapp,
  social: { facebook: siteConfig.social.facebook, instagram: siteConfig.social.instagram, twitter: siteConfig.social.twitter },
  seoTitle: siteConfig.name,
  seoDescription: siteConfig.description,
};

export async function getPublicSiteSettings(): Promise<PublicSiteSettings> {
  try {
    const response = await fetch(`${API_URL}/settings/public`, { next: { revalidate: 60 } });
    if (!response.ok) return defaults;
    const payload = (await response.json()) as { data?: Setting[] };
    const values = Object.fromEntries((payload.data ?? []).map((item) => [item.key, item.value]));
    return {
      phone: values.CONTACT_PHONE || defaults.phone,
      email: values.CONTACT_EMAIL || defaults.email,
      address: values.CONTACT_ADDRESS || defaults.address,
      whatsapp: values.WHATSAPP_NUMBER || defaults.whatsapp,
      social: {
        facebook: values.FACEBOOK_URL || defaults.social.facebook,
        instagram: values.INSTAGRAM_URL || defaults.social.instagram,
        twitter: values.X_URL || defaults.social.twitter,
      },
      seoTitle: values.SEO_TITLE || defaults.seoTitle,
      seoDescription: values.SEO_DESCRIPTION || defaults.seoDescription,
    };
  } catch {
    return defaults;
  }
}
