BEGIN;
LOCK TABLE "Land" IN SHARE ROW EXCLUSIVE MODE;
CREATE FUNCTION pg_temp.land_title_key(text) RETURNS text LANGUAGE SQL IMMUTABLE STRICT AS $$
  SELECT lower(btrim(regexp_replace(normalize($1, NFKC), '[[:space:]]+', ' ', 'g')));
$$;
DO $$
DECLARE r RECORD; candidate TEXT; n INTEGER; base TEXT;
BEGIN
  FOR r IN SELECT "id", "ownerId", "title", "createdAt" FROM "Land" WHERE "deletedAt" IS NULL ORDER BY "createdAt", "id" LOOP
    base := left(btrim(regexp_replace(normalize(r."title", NFKC), '[[:space:]]+', ' ', 'g')), 150);
    IF base = '' THEN base := 'Untitled design'; END IF;
    candidate := base;
    IF pg_temp.land_title_key(base) = 'untitled design' OR EXISTS (
      SELECT 1 FROM "Land" other WHERE other."ownerId" = r."ownerId" AND other."deletedAt" IS NULL
      AND (other."createdAt", other."id") < (r."createdAt", r."id")
      AND pg_temp.land_title_key(other."title") = pg_temp.land_title_key(base)
    ) THEN
      n := 1;
      LOOP
        IF pg_temp.land_title_key(base) = 'untitled design' THEN candidate := 'Untitled design ' || n;
        ELSE candidate := left(base, 150 - length(' (' || n || ')')) || ' (' || n || ')'; END IF;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM "Land" other WHERE other."ownerId" = r."ownerId" AND other."deletedAt" IS NULL AND other."id" <> r."id" AND pg_temp.land_title_key(other."title") = pg_temp.land_title_key(candidate));
        n := n + 1;
      END LOOP;
    END IF;
    UPDATE "Land" SET "title" = candidate WHERE "id" = r."id";
  END LOOP;
END $$;
CREATE UNIQUE INDEX "Land_ownerId_title_normalized_active_key" ON "Land" (
 "ownerId", (lower(btrim(regexp_replace(normalize("title", NFKC), '[[:space:]]+', ' ', 'g'))))
) WHERE "deletedAt" IS NULL;
COMMIT;
