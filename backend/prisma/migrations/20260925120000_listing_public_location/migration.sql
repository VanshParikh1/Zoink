-- Public (fuzzed) listing location. Non-owners are only ever shown this point,
-- and distance sorting / radius search use it, so a listing's exact pickup
-- point can't be read off the API or trilaterated from distances.

-- AlterTable
ALTER TABLE "listings" ADD COLUMN "publicLatitude" DOUBLE PRECISION,
ADD COLUMN "publicLongitude" DOUBLE PRECISION;

-- A random 200-500 m offset in a random direction, rolled when a listing is
-- created and again only when its exact location changes (or the public point
-- is missing) — stable across requests. Done in the database so every write
-- path (API, seed scripts, test helpers) gets it.
CREATE OR REPLACE FUNCTION listings_set_public_location() RETURNS trigger AS $$
DECLARE
  offset_m double precision;
  bearing double precision;
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW."publicLatitude" IS NULL
     OR NEW."publicLongitude" IS NULL
     OR NEW."latitude" IS DISTINCT FROM OLD."latitude"
     OR NEW."longitude" IS DISTINCT FROM OLD."longitude" THEN
    offset_m := 200 + random() * 300;
    bearing := random() * 2 * pi();
    NEW."publicLatitude" := NEW."latitude" + (offset_m * cos(bearing)) / 111320.0;
    NEW."publicLongitude" := NEW."longitude"
      + (offset_m * sin(bearing)) / (111320.0 * GREATEST(cos(radians(NEW."latitude")), 0.01));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "listings_public_location"
BEFORE INSERT OR UPDATE ON "listings"
FOR EACH ROW EXECUTE FUNCTION listings_set_public_location();

-- Backfill existing listings (the trigger fills the NULL public point).
UPDATE "listings" SET "latitude" = "latitude";
