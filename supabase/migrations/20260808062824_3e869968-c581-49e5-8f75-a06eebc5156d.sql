CREATE VIEW public.vocab_enum WITH (security_invoker = on) AS
SELECT t.typname::text AS enum_name, e.enumlabel::text AS value, e.enumsortorder::int AS sort_order
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public';
GRANT SELECT ON public.vocab_enum TO authenticated;
GRANT ALL ON public.vocab_enum TO service_role;