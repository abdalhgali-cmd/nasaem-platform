import { z } from "zod";
import { SITE_ASSET_KEYS } from "./site-assets.constants.js";

export const siteAssetKeyParamSchema = z.object({
  key: z.enum(SITE_ASSET_KEYS),
});
