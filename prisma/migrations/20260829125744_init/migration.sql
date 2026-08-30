-- CreateTable
CREATE TABLE "Cafe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "qrCode" TEXT NOT NULL,
    "pricingConfig" TEXT NOT NULL,
    "printerConfig" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobNumber" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "selectedPages" TEXT NOT NULL,
    "colorMode" TEXT NOT NULL,
    "paperSize" TEXT NOT NULL,
    "copies" INTEGER NOT NULL,
    "pricePerPage" REAL NOT NULL,
    "totalAmount" REAL NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL,
    "printStatus" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PrintJob_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Cafe_qrCode_key" ON "Cafe"("qrCode");

-- CreateIndex
CREATE UNIQUE INDEX "PrintJob_jobNumber_key" ON "PrintJob"("jobNumber");
