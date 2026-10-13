-- service_role has no role-level timeout, so PostgREST calls inherit authenticator's 8s.
alter role service_role set statement_timeout = '120s';
