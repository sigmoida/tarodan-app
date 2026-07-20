-- Rates are stored as whole percentages, so the columns must accommodate
-- values up to the API's maximum of 100.0000.
ALTER TABLE "commission_rules"
    ALTER COLUMN "percentage" TYPE DECIMAL(7,4),
    ALTER COLUMN "seller_rate" TYPE DECIMAL(7,4),
    ALTER COLUMN "buyer_rate" TYPE DECIMAL(7,4);
