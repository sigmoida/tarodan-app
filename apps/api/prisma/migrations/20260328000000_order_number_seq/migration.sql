-- Create a PostgreSQL sequence for atomic order number generation.
-- Starts from the current max order count to avoid collisions with
-- existing orders that were created using the old count-based approach.
DO $$
DECLARE
  current_max bigint;
BEGIN
  SELECT COUNT(*) INTO current_max FROM orders;
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH %s INCREMENT BY 1 NO CYCLE', current_max + 1);
END $$;
