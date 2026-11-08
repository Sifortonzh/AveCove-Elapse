BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_slot SMALLINT CHECK (avatar_slot BETWEEN 0 AND 15);

-- A stable one-time backfill. Preserve existing assignments on redeploy.
WITH unassigned AS (
  SELECT id, ((row_number() OVER (ORDER BY created_at, id) - 1) % 16)::smallint AS slot
  FROM users WHERE avatar_slot IS NULL
)
UPDATE users u SET avatar_slot = a.slot FROM unassigned a WHERE u.id = a.id;
ALTER TABLE users ALTER COLUMN avatar_slot SET NOT NULL;

CREATE OR REPLACE FUNCTION elapse_assign_avatar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- The sign-in UPSERT takes this fast path for an existing account.
  SELECT avatar_slot INTO NEW.avatar_slot FROM users WHERE id = NEW.id;
  IF FOUND THEN RETURN NEW; END IF;
  -- Serialize new assignments, preferring an unused slot before any reuse.
  PERFORM pg_advisory_xact_lock(51861, 1);
  SELECT slots.slot INTO NEW.avatar_slot
  FROM generate_series(0, 15) AS slots(slot)
  LEFT JOIN users u ON u.avatar_slot = slots.slot
  GROUP BY slots.slot ORDER BY count(u.id), slots.slot LIMIT 1;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER elapse_assign_avatar_before_insert
BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION elapse_assign_avatar();

COMMIT;
