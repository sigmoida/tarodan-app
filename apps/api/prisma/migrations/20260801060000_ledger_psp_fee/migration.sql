-- Faz 5: PayTR işlem kesintisi (kesinti_tutari) defterde psp_fee gideri olarak izlenir.
ALTER TYPE "LedgerAccount" ADD VALUE 'psp_fee';
ALTER TYPE "LedgerEventType" ADD VALUE 'psp_fee_accrued';
ALTER TABLE "paytr_statement_lines" ADD COLUMN "ledger_recorded_at" TIMESTAMP(3);
