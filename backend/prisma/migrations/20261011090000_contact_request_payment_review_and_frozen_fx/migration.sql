-- Receipt rejection (reason shown to the customer) and the exchange rate
-- frozen on a price when it is issued. Additive and nullable: existing rows
-- keep behaving exactly as before.

-- AlterTable
ALTER TABLE "ContactRequest" ADD COLUMN     "paymentRejectedAt" TIMESTAMP(3),
ADD COLUMN     "paymentRejectionReason" TEXT;

-- AlterTable
ALTER TABLE "ContactRequestOffer" ADD COLUMN     "amountSdg" DECIMAL(14,2),
ADD COLUMN     "exchangeRateToSdg" DECIMAL(18,6),
ADD COLUMN     "rateFixedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "amountSdg" DECIMAL(14,2),
ADD COLUMN     "exchangeRateToSdg" DECIMAL(18,6),
ADD COLUMN     "rateFixedAt" TIMESTAMP(3);
