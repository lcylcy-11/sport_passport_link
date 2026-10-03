-- Run once in the Supabase SQL editor. These RPCs are server-only.
CREATE SCHEMA IF NOT EXISTS dwnc_private;
REVOKE ALL ON SCHEMA dwnc_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS dwnc_private.sports_store (
  id integer PRIMARY KEY CHECK (id=1),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision>=0),
  capsule jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO dwnc_private.sports_store(id) VALUES(1) ON CONFLICT DO NOTHING;
ALTER TABLE dwnc_private.sports_store ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dwnc_private.sports_store FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dwnc_read_store()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN (SELECT jsonb_build_object('revision',revision,'capsule',capsule) FROM dwnc_private.sports_store WHERE id=1);
END;
$$;

CREATE OR REPLACE FUNCTION public.dwnc_commit_store(p_expected_revision bigint,p_capsule jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE current_revision bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF p_capsule IS NULL OR p_capsule->>'version' IS DISTINCT FROM '1'
     OR jsonb_typeof(p_capsule->'tables') IS DISTINCT FROM 'object'
     OR octet_length(p_capsule::text)>20971520 THEN RAISE EXCEPTION 'Invalid capsule'; END IF;
  SELECT revision INTO current_revision FROM dwnc_private.sports_store WHERE id=1 FOR UPDATE;
  IF current_revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('committed',false,'revision',current_revision);
  END IF;
  UPDATE dwnc_private.sports_store SET capsule=p_capsule,revision=revision+1,updated_at=now() WHERE id=1;
  RETURN jsonb_build_object('committed',true,'revision',current_revision+1);
END;
$$;
REVOKE ALL ON FUNCTION public.dwnc_read_store() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dwnc_commit_store(bigint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dwnc_read_store() TO service_role;
GRANT EXECUTE ON FUNCTION public.dwnc_commit_store(bigint,jsonb) TO service_role;
