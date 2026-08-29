import { z } from "zod";

export const updateFeatureFlagSchema = z.object({
  enabled: z.coerce.boolean(),
});
