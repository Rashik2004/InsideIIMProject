-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('INVEST', 'PASS', 'HOLD');

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ticker" TEXT,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchRun" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasoning" JSONB NOT NULL,
    "sources" JSONB NOT NULL,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchRun_companyId_createdAt_idx" ON "ResearchRun"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "ResearchRun" ADD CONSTRAINT "ResearchRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
