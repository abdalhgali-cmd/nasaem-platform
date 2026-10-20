// Applies the Egypt security approval service settings to the database the
// process is pointed at (DATABASE_URL), through the same validated, audited
// transaction as the admin screen (Egypt tab → ضبط الخدمة والأسعار).
// Run only against an environment you are authorized to change, after its
// backup is verified:
//   node src/scripts/configure-egypt-pricing.js --air 85 --border 155 --usd 9200 [--inactive-air] [--inactive-border]
// Prints the configuration before and after. Never touches existing requests.
import prisma from "../config/database.js";
import { applyEgyptPricingConfig, currentConfig } from "../modules/egypt-clearance/egypt-pricing-admin.controller.js";

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const input = {
  usdRateToSdg: Number(arg("usd")),
  air: { priceUsd: Number(arg("air")), active: !process.argv.includes("--inactive-air") },
  border: { priceUsd: Number(arg("border")), active: !process.argv.includes("--inactive-border") },
};

try {
  console.log("before:", JSON.stringify(await currentConfig()));
  const result = await applyEgyptPricingConfig(input);
  if (result.error) {
    console.error("refused:", result.error, JSON.stringify(result.details));
    process.exitCode = 1;
  } else {
    console.log("after:", JSON.stringify(result.config));
    if (result.warning) console.warn("warning:", result.warning);
  }
} finally {
  await prisma.$disconnect();
}
