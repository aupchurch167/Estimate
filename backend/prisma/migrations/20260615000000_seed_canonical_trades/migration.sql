-- Seed the canonical trade vocabulary.
--
-- Canonical trades are reference data: every environment needs them for the
-- trade pickers (e.g. the bid package modal) to work, independent of the
-- destructive dev seed in prisma/seed.ts. This data migration guarantees the
-- vocabulary exists in every database that runs `prisma migrate deploy`.
--
-- It is idempotent: ON CONFLICT on the unique `code` skips rows that already
-- exist, so re-running (or running against a DB the dev seed already
-- populated) is a no-op. Keep this list in sync with the CANONICAL_TRADES
-- array in prisma/seedTrades.ts; new trades should be added via a new
-- migration, since applied migrations are immutable.

INSERT INTO "TradeCanonical" ("id", "name", "code", "category", "displayOrder")
VALUES
  (gen_random_uuid()::text, 'Electrical', 'E', 'ELECTRICAL', 1),
  (gen_random_uuid()::text, 'Plumbing', 'P', 'PLUMBING', 2),
  (gen_random_uuid()::text, 'HVAC', 'M', 'MECHANICAL', 3),
  (gen_random_uuid()::text, 'Fire Protection / Sprinkler', 'FP', 'FIRE_PROTECTION', 4),
  (gen_random_uuid()::text, 'Low Voltage', 'LV', 'ELECTRICAL', 5),
  (gen_random_uuid()::text, 'Concrete', 'C', 'STRUCTURAL', 6),
  (gen_random_uuid()::text, 'Concrete Flatwork', 'CF', 'STRUCTURAL', 7),
  (gen_random_uuid()::text, 'Masonry', 'MS', 'STRUCTURAL', 8),
  (gen_random_uuid()::text, 'Steel / Structural Steel', 'ST', 'STRUCTURAL', 9),
  (gen_random_uuid()::text, 'Framing — Wood', 'FW', 'STRUCTURAL', 10),
  (gen_random_uuid()::text, 'Framing — Metal Stud', 'FM', 'STRUCTURAL', 11),
  (gen_random_uuid()::text, 'Roofing', 'R', 'EXTERIOR', 12),
  (gen_random_uuid()::text, 'Waterproofing', 'WP', 'EXTERIOR', 13),
  (gen_random_uuid()::text, 'Insulation', 'IN', 'ARCHITECTURAL', 14),
  (gen_random_uuid()::text, 'Drywall', 'D', 'FINISHES', 15),
  (gen_random_uuid()::text, 'Acoustic Ceilings', 'AC', 'FINISHES', 16),
  (gen_random_uuid()::text, 'Flooring — Hard Surface', 'FH', 'FINISHES', 17),
  (gen_random_uuid()::text, 'Flooring — Carpet', 'FC', 'FINISHES', 18),
  (gen_random_uuid()::text, 'Tile', 'TL', 'FINISHES', 19),
  (gen_random_uuid()::text, 'Paint', 'PT', 'FINISHES', 20),
  (gen_random_uuid()::text, 'Wall Coverings', 'WC', 'FINISHES', 21),
  (gen_random_uuid()::text, 'Millwork', 'MW', 'ARCHITECTURAL', 22),
  (gen_random_uuid()::text, 'Casework', 'CW', 'ARCHITECTURAL', 23),
  (gen_random_uuid()::text, 'Doors & Hardware', 'DH', 'ARCHITECTURAL', 24),
  (gen_random_uuid()::text, 'Glass & Glazing', 'GG', 'ARCHITECTURAL', 25),
  (gen_random_uuid()::text, 'Specialties', 'SP', 'SPECIALTIES', 26),
  (gen_random_uuid()::text, 'Demolition', 'DM', 'GENERAL', 27),
  (gen_random_uuid()::text, 'Site Work / Earthwork', 'SW', 'SITE', 28),
  (gen_random_uuid()::text, 'Landscaping', 'LS', 'SITE', 29),
  (gen_random_uuid()::text, 'Asphalt / Paving', 'AP', 'SITE', 30),
  (gen_random_uuid()::text, 'Site Utilities', 'SU', 'SITE', 31),
  (gen_random_uuid()::text, 'Kitchen Equipment', 'KE', 'EQUIPMENT', 32),
  (gen_random_uuid()::text, 'Appliances', 'AQ', 'EQUIPMENT', 33),
  (gen_random_uuid()::text, 'Elevators / Lifts', 'EL', 'EQUIPMENT', 34),
  (gen_random_uuid()::text, 'Signage', 'SG', 'SPECIALTIES', 35),
  (gen_random_uuid()::text, 'General Conditions', 'GC', 'GENERAL', 36),
  (gen_random_uuid()::text, 'Other', 'OT', 'GENERAL', 37)
ON CONFLICT ("code") DO NOTHING;
