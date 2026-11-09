ALTER TABLE "Customer" ADD COLUMN "googleSubject" TEXT;
CREATE UNIQUE INDEX "Customer_googleSubject_key" ON "Customer"("googleSubject");
