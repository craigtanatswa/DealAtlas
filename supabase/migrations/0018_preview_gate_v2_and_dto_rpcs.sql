-- DealAtlas migration 0018
-- Preview publish gate v2, sanitised DTO read RPCs and fail-closed Pro check.
--
-- Additive only: apply BEFORE deploying the app that reads previews through the
-- DTO RPCs. Direct anon/authenticated table access is removed separately in
-- 0019, which must only be applied after that app deploy is live.

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_trgm'
      and n.nspname = 'extensions'
  ) then
    raise exception 'pg_trgm must be installed in schema extensions before migration 0018';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Shared gate vocabulary. Mirrors lib/redaction/gate-vocabulary.ts; the pgTAP
-- parity suite fails when the two drift.
-- -----------------------------------------------------------------------------
create table if not exists private.leak_gate_terms (
  kind text not null check (
    kind in (
      'generic_org_token',
      'generic_acronym',
      'generic_proper_word',
      'broad_location',
      'reference_prefix',
      'postcode_like',
      'phrase_stopword',
      'source_platform'
    )
  ),
  term text not null check (length(term) between 1 and 80),
  primary key (kind, term)
);

revoke all on table private.leak_gate_terms from public, anon, authenticated;
grant select on table private.leak_gate_terms to service_role;

delete from private.leak_gate_terms;
insert into private.leak_gate_terms (kind, term) values
  ('generic_org_token', 'academies'),
  ('generic_org_token', 'academy'),
  ('generic_org_token', 'agency'),
  ('generic_org_token', 'ambulance'),
  ('generic_org_token', 'and'),
  ('generic_org_token', 'association'),
  ('generic_org_token', 'authorities'),
  ('generic_org_token', 'authority'),
  ('generic_org_token', 'board'),
  ('generic_org_token', 'borough'),
  ('generic_org_token', 'britain'),
  ('generic_org_token', 'british'),
  ('generic_org_token', 'care'),
  ('generic_org_token', 'central'),
  ('generic_org_token', 'cic'),
  ('generic_org_token', 'city'),
  ('generic_org_token', 'college'),
  ('generic_org_token', 'combined'),
  ('generic_org_token', 'commercial'),
  ('generic_org_token', 'commission'),
  ('generic_org_token', 'commissioner'),
  ('generic_org_token', 'community'),
  ('generic_org_token', 'companies'),
  ('generic_org_token', 'company'),
  ('generic_org_token', 'construction'),
  ('generic_org_token', 'consulting'),
  ('generic_org_token', 'contractors'),
  ('generic_org_token', 'corporation'),
  ('generic_org_token', 'council'),
  ('generic_org_token', 'councils'),
  ('generic_org_token', 'county'),
  ('generic_org_token', 'crown'),
  ('generic_org_token', 'department'),
  ('generic_org_token', 'dept'),
  ('generic_org_token', 'development'),
  ('generic_org_token', 'district'),
  ('generic_org_token', 'east'),
  ('generic_org_token', 'eastern'),
  ('generic_org_token', 'education'),
  ('generic_org_token', 'electricity'),
  ('generic_org_token', 'energy'),
  ('generic_org_token', 'engineering'),
  ('generic_org_token', 'england'),
  ('generic_org_token', 'english'),
  ('generic_org_token', 'enterprises'),
  ('generic_org_token', 'estates'),
  ('generic_org_token', 'executive'),
  ('generic_org_token', 'facilities'),
  ('generic_org_token', 'fire'),
  ('generic_org_token', 'for'),
  ('generic_org_token', 'foundation'),
  ('generic_org_token', 'gas'),
  ('generic_org_token', 'global'),
  ('generic_org_token', 'government'),
  ('generic_org_token', 'greater'),
  ('generic_org_token', 'group'),
  ('generic_org_token', 'groups'),
  ('generic_org_token', 'health'),
  ('generic_org_token', 'healthcare'),
  ('generic_org_token', 'highways'),
  ('generic_org_token', 'holdings'),
  ('generic_org_token', 'homes'),
  ('generic_org_token', 'hospital'),
  ('generic_org_token', 'hospitals'),
  ('generic_org_token', 'housing'),
  ('generic_org_token', 'industries'),
  ('generic_org_token', 'infrastructure'),
  ('generic_org_token', 'integrated'),
  ('generic_org_token', 'international'),
  ('generic_org_token', 'ireland'),
  ('generic_org_token', 'kingdom'),
  ('generic_org_token', 'limited'),
  ('generic_org_token', 'llc'),
  ('generic_org_token', 'llp'),
  ('generic_org_token', 'local'),
  ('generic_org_token', 'lower'),
  ('generic_org_token', 'ltd'),
  ('generic_org_token', 'majesty'),
  ('generic_org_token', 'majestys'),
  ('generic_org_token', 'management'),
  ('generic_org_token', 'metropolitan'),
  ('generic_org_token', 'ministry'),
  ('generic_org_token', 'national'),
  ('generic_org_token', 'network'),
  ('generic_org_token', 'networks'),
  ('generic_org_token', 'new'),
  ('generic_org_token', 'nhs'),
  ('generic_org_token', 'north'),
  ('generic_org_token', 'northern'),
  ('generic_org_token', 'office'),
  ('generic_org_token', 'parish'),
  ('generic_org_token', 'partners'),
  ('generic_org_token', 'partnership'),
  ('generic_org_token', 'plc'),
  ('generic_org_token', 'police'),
  ('generic_org_token', 'power'),
  ('generic_org_token', 'private'),
  ('generic_org_token', 'property'),
  ('generic_org_token', 'public'),
  ('generic_org_token', 'rail'),
  ('generic_org_token', 'railway'),
  ('generic_org_token', 'railways'),
  ('generic_org_token', 'regional'),
  ('generic_org_token', 'rescue'),
  ('generic_org_token', 'road'),
  ('generic_org_token', 'roads'),
  ('generic_org_token', 'royal'),
  ('generic_org_token', 'school'),
  ('generic_org_token', 'schools'),
  ('generic_org_token', 'scotland'),
  ('generic_org_token', 'scottish'),
  ('generic_org_token', 'service'),
  ('generic_org_token', 'services'),
  ('generic_org_token', 'solutions'),
  ('generic_org_token', 'south'),
  ('generic_org_token', 'southern'),
  ('generic_org_token', 'support'),
  ('generic_org_token', 'system'),
  ('generic_org_token', 'systems'),
  ('generic_org_token', 'technologies'),
  ('generic_org_token', 'technology'),
  ('generic_org_token', 'the'),
  ('generic_org_token', 'town'),
  ('generic_org_token', 'trading'),
  ('generic_org_token', 'transport'),
  ('generic_org_token', 'trust'),
  ('generic_org_token', 'trusts'),
  ('generic_org_token', 'united'),
  ('generic_org_token', 'university'),
  ('generic_org_token', 'upper'),
  ('generic_org_token', 'utilities'),
  ('generic_org_token', 'ventures'),
  ('generic_org_token', 'wales'),
  ('generic_org_token', 'water'),
  ('generic_org_token', 'welsh'),
  ('generic_org_token', 'west'),
  ('generic_org_token', 'western'),
  ('generic_org_token', 'with'),
  ('generic_acronym', 'A&E'),
  ('generic_acronym', 'AED'),
  ('generic_acronym', 'ANPR'),
  ('generic_acronym', 'API'),
  ('generic_acronym', 'APIS'),
  ('generic_acronym', 'ASB'),
  ('generic_acronym', 'AWS'),
  ('generic_acronym', 'BCP'),
  ('generic_acronym', 'BIM'),
  ('generic_acronym', 'BMS'),
  ('generic_acronym', 'BREEAM'),
  ('generic_acronym', 'BSI'),
  ('generic_acronym', 'BTEC'),
  ('generic_acronym', 'CAD'),
  ('generic_acronym', 'CCTV'),
  ('generic_acronym', 'CDM'),
  ('generic_acronym', 'CHAS'),
  ('generic_acronym', 'CMS'),
  ('generic_acronym', 'CNC'),
  ('generic_acronym', 'CO2'),
  ('generic_acronym', 'COSHH'),
  ('generic_acronym', 'COVID'),
  ('generic_acronym', 'COVID19'),
  ('generic_acronym', 'CPD'),
  ('generic_acronym', 'CPV'),
  ('generic_acronym', 'CQC'),
  ('generic_acronym', 'CRM'),
  ('generic_acronym', 'CSCS'),
  ('generic_acronym', 'CSR'),
  ('generic_acronym', 'DBS'),
  ('generic_acronym', 'DDA'),
  ('generic_acronym', 'DFMA'),
  ('generic_acronym', 'DPIA'),
  ('generic_acronym', 'DPS'),
  ('generic_acronym', 'EHCP'),
  ('generic_acronym', 'EHR'),
  ('generic_acronym', 'EOI'),
  ('generic_acronym', 'EPC'),
  ('generic_acronym', 'EPR'),
  ('generic_acronym', 'ERP'),
  ('generic_acronym', 'ESG'),
  ('generic_acronym', 'ESOL'),
  ('generic_acronym', 'EVCP'),
  ('generic_acronym', 'EVS'),
  ('generic_acronym', 'FOI'),
  ('generic_acronym', 'GBP'),
  ('generic_acronym', 'GCSE'),
  ('generic_acronym', 'GDPR'),
  ('generic_acronym', 'GIS'),
  ('generic_acronym', 'GPS'),
  ('generic_acronym', 'HGV'),
  ('generic_acronym', 'HSCN'),
  ('generic_acronym', 'HVAC'),
  ('generic_acronym', 'IAAS'),
  ('generic_acronym', 'IAM'),
  ('generic_acronym', 'ICT'),
  ('generic_acronym', 'ICU'),
  ('generic_acronym', 'IOT'),
  ('generic_acronym', 'IR35'),
  ('generic_acronym', 'ISO'),
  ('generic_acronym', 'ITT'),
  ('generic_acronym', 'JCT'),
  ('generic_acronym', 'KPI'),
  ('generic_acronym', 'KPIS'),
  ('generic_acronym', 'LAN'),
  ('generic_acronym', 'LED'),
  ('generic_acronym', 'LGV'),
  ('generic_acronym', 'LIMS'),
  ('generic_acronym', 'LOLER'),
  ('generic_acronym', 'LPG'),
  ('generic_acronym', 'M&E'),
  ('generic_acronym', 'MEP'),
  ('generic_acronym', 'MEWP'),
  ('generic_acronym', 'MFA'),
  ('generic_acronym', 'MMC'),
  ('generic_acronym', 'MOT'),
  ('generic_acronym', 'MPLS'),
  ('generic_acronym', 'MRI'),
  ('generic_acronym', 'NEC'),
  ('generic_acronym', 'NHS'),
  ('generic_acronym', 'NVQ'),
  ('generic_acronym', 'OEM'),
  ('generic_acronym', 'PAAS'),
  ('generic_acronym', 'PACS'),
  ('generic_acronym', 'PAS'),
  ('generic_acronym', 'PAT'),
  ('generic_acronym', 'PCR'),
  ('generic_acronym', 'PFI'),
  ('generic_acronym', 'PM10'),
  ('generic_acronym', 'PPE'),
  ('generic_acronym', 'PQQ'),
  ('generic_acronym', 'PSN'),
  ('generic_acronym', 'PSTN'),
  ('generic_acronym', 'R&D'),
  ('generic_acronym', 'RFI'),
  ('generic_acronym', 'RFP'),
  ('generic_acronym', 'RFQ'),
  ('generic_acronym', 'RIDDOR'),
  ('generic_acronym', 'SAAS'),
  ('generic_acronym', 'SCADA'),
  ('generic_acronym', 'SEN'),
  ('generic_acronym', 'SEND'),
  ('generic_acronym', 'SIEM'),
  ('generic_acronym', 'SIP'),
  ('generic_acronym', 'SLA'),
  ('generic_acronym', 'SLAS'),
  ('generic_acronym', 'SME'),
  ('generic_acronym', 'SMES'),
  ('generic_acronym', 'SOC'),
  ('generic_acronym', 'SQL'),
  ('generic_acronym', 'SSIP'),
  ('generic_acronym', 'SSO'),
  ('generic_acronym', 'STEM'),
  ('generic_acronym', 'TUPE'),
  ('generic_acronym', 'UAT'),
  ('generic_acronym', 'UKAS'),
  ('generic_acronym', 'UPS'),
  ('generic_acronym', 'VAT'),
  ('generic_acronym', 'VCSE'),
  ('generic_acronym', 'VOIP'),
  ('generic_acronym', 'VPN'),
  ('generic_acronym', 'WAN'),
  ('generic_acronym', 'WIFI'),
  ('generic_proper_word', 'act'),
  ('generic_proper_word', 'agreement'),
  ('generic_proper_word', 'amazon'),
  ('generic_proper_word', 'and'),
  ('generic_proper_word', 'applicant'),
  ('generic_proper_word', 'applicants'),
  ('generic_proper_word', 'april'),
  ('generic_proper_word', 'august'),
  ('generic_proper_word', 'bidder'),
  ('generic_proper_word', 'bidders'),
  ('generic_proper_word', 'britain'),
  ('generic_proper_word', 'british'),
  ('generic_proper_word', 'building'),
  ('generic_proper_word', 'buyer'),
  ('generic_proper_word', 'buyers'),
  ('generic_proper_word', 'client'),
  ('generic_proper_word', 'consultant'),
  ('generic_proper_word', 'contractor'),
  ('generic_proper_word', 'contractors'),
  ('generic_proper_word', 'contracts'),
  ('generic_proper_word', 'customer'),
  ('generic_proper_word', 'cyber'),
  ('generic_proper_word', 'data'),
  ('generic_proper_word', 'december'),
  ('generic_proper_word', 'east'),
  ('generic_proper_word', 'employer'),
  ('generic_proper_word', 'england'),
  ('generic_proper_word', 'english'),
  ('generic_proper_word', 'essentials'),
  ('generic_proper_word', 'european'),
  ('generic_proper_word', 'february'),
  ('generic_proper_word', 'friday'),
  ('generic_proper_word', 'goods'),
  ('generic_proper_word', 'google'),
  ('generic_proper_word', 'great'),
  ('generic_proper_word', 'health'),
  ('generic_proper_word', 'humber'),
  ('generic_proper_word', 'ireland'),
  ('generic_proper_word', 'january'),
  ('generic_proper_word', 'july'),
  ('generic_proper_word', 'june'),
  ('generic_proper_word', 'kingdom'),
  ('generic_proper_word', 'living'),
  ('generic_proper_word', 'london'),
  ('generic_proper_word', 'lot'),
  ('generic_proper_word', 'lots'),
  ('generic_proper_word', 'march'),
  ('generic_proper_word', 'may'),
  ('generic_proper_word', 'microsoft'),
  ('generic_proper_word', 'midlands'),
  ('generic_proper_word', 'modern'),
  ('generic_proper_word', 'monday'),
  ('generic_proper_word', 'nationwide'),
  ('generic_proper_word', 'net'),
  ('generic_proper_word', 'north'),
  ('generic_proper_word', 'northern'),
  ('generic_proper_word', 'november'),
  ('generic_proper_word', 'october'),
  ('generic_proper_word', 'of'),
  ('generic_proper_word', 'office'),
  ('generic_proper_word', 'plus'),
  ('generic_proper_word', 'private'),
  ('generic_proper_word', 'procurement'),
  ('generic_proper_word', 'protection'),
  ('generic_proper_word', 'provider'),
  ('generic_proper_word', 'providers'),
  ('generic_proper_word', 'public'),
  ('generic_proper_word', 'purchaser'),
  ('generic_proper_word', 'real'),
  ('generic_proper_word', 'regulations'),
  ('generic_proper_word', 'remote'),
  ('generic_proper_word', 'safety'),
  ('generic_proper_word', 'saturday'),
  ('generic_proper_word', 'scotland'),
  ('generic_proper_word', 'scottish'),
  ('generic_proper_word', 'sector'),
  ('generic_proper_word', 'september'),
  ('generic_proper_word', 'slavery'),
  ('generic_proper_word', 'social'),
  ('generic_proper_word', 'south'),
  ('generic_proper_word', 'specification'),
  ('generic_proper_word', 'sunday'),
  ('generic_proper_word', 'supplier'),
  ('generic_proper_word', 'suppliers'),
  ('generic_proper_word', 'tenderer'),
  ('generic_proper_word', 'tenderers'),
  ('generic_proper_word', 'the'),
  ('generic_proper_word', 'thursday'),
  ('generic_proper_word', 'tuesday'),
  ('generic_proper_word', 'union'),
  ('generic_proper_word', 'united'),
  ('generic_proper_word', 'value'),
  ('generic_proper_word', 'wage'),
  ('generic_proper_word', 'wales'),
  ('generic_proper_word', 'wednesday'),
  ('generic_proper_word', 'welsh'),
  ('generic_proper_word', 'west'),
  ('generic_proper_word', 'works'),
  ('generic_proper_word', 'workspace'),
  ('generic_proper_word', 'yorkshire'),
  ('generic_proper_word', 'zero'),
  ('broad_location', 'britain'),
  ('broad_location', 'east'),
  ('broad_location', 'east midlands'),
  ('broad_location', 'east of england'),
  ('broad_location', 'england'),
  ('broad_location', 'europe'),
  ('broad_location', 'gb'),
  ('broad_location', 'great britain'),
  ('broad_location', 'ireland'),
  ('broad_location', 'london'),
  ('broad_location', 'midlands'),
  ('broad_location', 'nationwide'),
  ('broad_location', 'north'),
  ('broad_location', 'north east'),
  ('broad_location', 'north east england'),
  ('broad_location', 'north west'),
  ('broad_location', 'north west england'),
  ('broad_location', 'northern ireland'),
  ('broad_location', 'remote'),
  ('broad_location', 'scotland'),
  ('broad_location', 'south'),
  ('broad_location', 'south east'),
  ('broad_location', 'south east england'),
  ('broad_location', 'south west'),
  ('broad_location', 'south west england'),
  ('broad_location', 'uk'),
  ('broad_location', 'united kingdom'),
  ('broad_location', 'wales'),
  ('broad_location', 'west'),
  ('broad_location', 'west midlands'),
  ('broad_location', 'yorkshire and the humber'),
  ('reference_prefix', 'bs'),
  ('reference_prefix', 'bsen'),
  ('reference_prefix', 'en'),
  ('reference_prefix', 'g'),
  ('reference_prefix', 'hbn'),
  ('reference_prefix', 'htm'),
  ('reference_prefix', 'iec'),
  ('reference_prefix', 'ipv'),
  ('reference_prefix', 'iso'),
  ('reference_prefix', 'jct'),
  ('reference_prefix', 'lot'),
  ('reference_prefix', 'm'),
  ('reference_prefix', 'nec'),
  ('reference_prefix', 'office'),
  ('reference_prefix', 'pas'),
  ('reference_prefix', 'phase'),
  ('reference_prefix', 'shtm'),
  ('reference_prefix', 'tier'),
  ('reference_prefix', 'year'),
  ('postcode_like', 'A3'),
  ('postcode_like', 'A4'),
  ('postcode_like', 'A5'),
  ('postcode_like', 'B2B'),
  ('postcode_like', 'B2C'),
  ('postcode_like', 'B2G'),
  ('postcode_like', 'CO2'),
  ('postcode_like', 'E2E'),
  ('postcode_like', 'G2G'),
  ('postcode_like', 'H2'),
  ('postcode_like', 'H2O'),
  ('postcode_like', 'IR35'),
  ('postcode_like', 'KS1'),
  ('postcode_like', 'KS2'),
  ('postcode_like', 'KS3'),
  ('postcode_like', 'KS4'),
  ('postcode_like', 'KS5'),
  ('postcode_like', 'NO2'),
  ('postcode_like', 'P2P'),
  ('postcode_like', 'PM10'),
  ('postcode_like', 'SO2'),
  ('phrase_stopword', 'a'),
  ('phrase_stopword', 'across'),
  ('phrase_stopword', 'all'),
  ('phrase_stopword', 'also'),
  ('phrase_stopword', 'an'),
  ('phrase_stopword', 'and'),
  ('phrase_stopword', 'any'),
  ('phrase_stopword', 'are'),
  ('phrase_stopword', 'as'),
  ('phrase_stopword', 'at'),
  ('phrase_stopword', 'be'),
  ('phrase_stopword', 'been'),
  ('phrase_stopword', 'being'),
  ('phrase_stopword', 'by'),
  ('phrase_stopword', 'can'),
  ('phrase_stopword', 'contract'),
  ('phrase_stopword', 'contracts'),
  ('phrase_stopword', 'could'),
  ('phrase_stopword', 'delivery'),
  ('phrase_stopword', 'for'),
  ('phrase_stopword', 'framework'),
  ('phrase_stopword', 'from'),
  ('phrase_stopword', 'has'),
  ('phrase_stopword', 'have'),
  ('phrase_stopword', 'in'),
  ('phrase_stopword', 'include'),
  ('phrase_stopword', 'including'),
  ('phrase_stopword', 'into'),
  ('phrase_stopword', 'is'),
  ('phrase_stopword', 'it'),
  ('phrase_stopword', 'its'),
  ('phrase_stopword', 'may'),
  ('phrase_stopword', 'must'),
  ('phrase_stopword', 'no'),
  ('phrase_stopword', 'not'),
  ('phrase_stopword', 'of'),
  ('phrase_stopword', 'on'),
  ('phrase_stopword', 'opportunity'),
  ('phrase_stopword', 'or'),
  ('phrase_stopword', 'other'),
  ('phrase_stopword', 'our'),
  ('phrase_stopword', 'over'),
  ('phrase_stopword', 'per'),
  ('phrase_stopword', 'provision'),
  ('phrase_stopword', 'requirement'),
  ('phrase_stopword', 'requirements'),
  ('phrase_stopword', 'service'),
  ('phrase_stopword', 'services'),
  ('phrase_stopword', 'should'),
  ('phrase_stopword', 'such'),
  ('phrase_stopword', 'supply'),
  ('phrase_stopword', 'tender'),
  ('phrase_stopword', 'that'),
  ('phrase_stopword', 'the'),
  ('phrase_stopword', 'their'),
  ('phrase_stopword', 'these'),
  ('phrase_stopword', 'this'),
  ('phrase_stopword', 'those'),
  ('phrase_stopword', 'to'),
  ('phrase_stopword', 'under'),
  ('phrase_stopword', 'up'),
  ('phrase_stopword', 'was'),
  ('phrase_stopword', 'we'),
  ('phrase_stopword', 'were'),
  ('phrase_stopword', 'which'),
  ('phrase_stopword', 'who'),
  ('phrase_stopword', 'will'),
  ('phrase_stopword', 'with'),
  ('phrase_stopword', 'within'),
  ('phrase_stopword', 'would'),
  ('phrase_stopword', 'you'),
  ('source_platform', 'contracts finder'),
  ('source_platform', 'contractsfinder'),
  ('source_platform', 'crown commercial service'),
  ('source_platform', 'e-tenders ni'),
  ('source_platform', 'etendersni'),
  ('source_platform', 'find a tender'),
  ('source_platform', 'find-a-tender'),
  ('source_platform', 'find-tender'),
  ('source_platform', 'nista'),
  ('source_platform', 'public contracts scotland'),
  ('source_platform', 'sell2wales'),
  ('source_platform', 'ted.europa.eu'),
  ('source_platform', 'tenders electronic daily'),
  ('source_platform', 'uk infrastructure pipeline')
;

-- -----------------------------------------------------------------------------
-- Normalisation shared with lib/redaction/gate-normalize.ts: lowercase ASCII
-- alphanumerics separated by single spaces, padded so word containment is a
-- plain position() check.
-- -----------------------------------------------------------------------------
create or replace function private.leak_norm(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select ' ' || pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.lower(coalesce(p, '')), '[^a-z0-9]+', ' ', 'g')) || ' ';
$$;

revoke execute on function private.leak_norm(text) from public, anon, authenticated;

-- Organisation names with legal suffixes removed, for matching any known
-- organisation (buyer, supplier, incumbent) in preview text. Built-ins only so
-- the generated columns stay immutable and privilege-free.
alter table public.organizations
  add column if not exists leak_match_name text generated always as (
    case
      when length(btrim(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(canonical_name, '')), '[^a-z0-9]+', ' ', 'g'), '\m(ltd|limited|llp|plc|llc|inc|cic|co|the)\M', ' ', 'g'), '\s+', ' ', 'g'))) >= 3
      then ' ' || btrim(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(canonical_name, '')), '[^a-z0-9]+', ' ', 'g'), '\m(ltd|limited|llp|plc|llc|inc|cic|co|the)\M', ' ', 'g'), '\s+', ' ', 'g')) || ' '
    end
  ) stored;

alter table public.organization_aliases
  add column if not exists leak_match_name text generated always as (
    case
      when length(btrim(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(alias, '')), '[^a-z0-9]+', ' ', 'g'), '\m(ltd|limited|llp|plc|llc|inc|cic|co|the)\M', ' ', 'g'), '\s+', ' ', 'g'))) >= 3
      then ' ' || btrim(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(alias, '')), '[^a-z0-9]+', ' ', 'g'), '\m(ltd|limited|llp|plc|llc|inc|cic|co|the)\M', ' ', 'g'), '\s+', ' ', 'g')) || ' '
    end
  ) stored;

comment on column public.organizations.leak_match_name is
  'Server-only normalised name used by the preview leak gate. Never expose.';
comment on column public.organization_aliases.leak_match_name is
  'Server-only normalised alias used by the preview leak gate. Never expose.';

-- Word index over source text for the combination (k-anonymity) rule.
create index if not exists deals_leak_source_tsv_idx on public.deals using gin (
  to_tsvector('simple'::regconfig, coalesce(source_title, '') || ' ' || coalesce(source_description, ''))
);

-- -----------------------------------------------------------------------------
-- Preview leak findings v2. Every rule returns (code, risk, token). Tokens may
-- contain protected values: this function is private and its output must only
-- reach service-role/admin code.
-- -----------------------------------------------------------------------------
create or replace function private.preview_leak_findings(
  p_deal_id uuid,
  p_slug text,
  p_preview_title text,
  p_preview_summary text,
  p_requirements jsonb,
  p_relevance_tags text[] default '{}'::text[],
  p_broad_region text default null
)
returns table (finding_code text, finding_risk public.leakage_risk, finding_token text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d public.deals%rowtype;
  b public.organizations%rowtype;
  v_has_buyer boolean := false;
  v_generic_org text[];
  v_generic_acr text[];
  v_generic_proper text[];
  v_broad text[];
  v_ref_prefix text[];
  v_postcode_like text[];
  v_stop text[];
  v_platforms text[];
  v_req text[];
  v_segments text[];
  v_prose_segments text[];
  v_slug text;
  v_slug_norm text;
  v_slug_tokens text[];
  v_text_cs text;
  v_all text;
  v_all_lower text;
  v_all_norm text;
  v_source_parts text[];
  v_source_raw text;
  v_source_norm text;
  v_source_acronyms text[];
  v_source_names text[];
  v_cs_tokens text[];
  v_term text;
  v_label text;
  v_norm text;
  v_words text[];
  v_window text;
  v_seg text;
  v_digits text;
  v_m text[];
  v_count integer;
  v_sim real;
  v_carried text[];
  v_k integer;
  v_amounts text[];
  i integer;
begin
  select * into d from public.deals where id = p_deal_id;
  if not found then
    return query select 'DEAL_MISSING'::text, 'HIGH'::public.leakage_risk, null::text;
    return;
  end if;

  select
    coalesce(array_agg(t.term) filter (where t.kind = 'generic_org_token'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'generic_acronym'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'generic_proper_word'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'broad_location'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'reference_prefix'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'postcode_like'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'phrase_stopword'), '{}'),
    coalesce(array_agg(t.term) filter (where t.kind = 'source_platform'), '{}')
  into v_generic_org, v_generic_acr, v_generic_proper, v_broad, v_ref_prefix, v_postcode_like, v_stop, v_platforms
  from private.leak_gate_terms t;

  -- Every string leaf of requirements_preview is scanned, not just text/label.
  select coalesce(array_agg(btrim(v #>> '{}')) filter (where btrim(v #>> '{}') <> ''), '{}')
  into v_req
  from jsonb_path_query(
    case when jsonb_typeof(p_requirements) in ('array', 'object') then p_requirements else '[]'::jsonb end,
    'strict $.**'
  ) as v
  where jsonb_typeof(v) = 'string';

  v_prose_segments := array_remove(array[nullif(btrim(p_preview_summary), '')], null) || v_req;
  v_segments := array_remove(array[nullif(btrim(p_preview_title), '')], null) || v_prose_segments;
  v_slug := regexp_replace(lower(coalesce(p_slug, '')), '-[0-9a-f]{8}$', '');
  v_slug_norm := private.leak_norm(v_slug);
  v_slug_tokens := string_to_array(btrim(v_slug_norm), ' ');
  v_text_cs := concat_ws(' . ', nullif(array_to_string(v_segments, ' . '), ''), nullif(array_to_string(coalesce(p_relevance_tags, '{}'), ' . '), ''));
  v_all := concat_ws(' . ', nullif(v_text_cs, ''), nullif(v_slug, ''));
  v_all_lower := lower(v_all);
  v_all_norm := private.leak_norm(v_all);
  v_cs_tokens := array(select m[1] from regexp_matches(v_text_cs, '([A-Za-z0-9&]+)', 'g') as m);

  select array_remove(
    array[d.source_title, d.source_description]
    || coalesce((select array_agg(x) from public.lots l, unnest(array[l.source_title, l.source_description]) as x where l.deal_id = d.id), '{}')
    || coalesce((select array_agg(x) from public.requirements r, unnest(array[r.name, r.description]) as x where r.deal_id = d.id), '{}')
    || coalesce((select array[pod.project_name] || pod.goods_required || pod.services_required || pod.works_required
       from public.private_opportunity_details pod where pod.deal_id = d.id), '{}'),
    null
  ) into v_source_parts;
  v_source_raw := array_to_string(v_source_parts, ' . ');
  v_source_norm := private.leak_norm(v_source_raw);

  -- Names the source uses: standalone acronyms (outside all-caps fields and
  -- all-caps runs) and capitalised words that follow a lowercase word and never
  -- appear in lowercase. Matched case-insensitively so slugs and lowercased
  -- prose cannot carry them.
  select coalesce(array_agg(distinct lower(m[1])), '{}') into v_source_acronyms
  from unnest(v_source_parts) as part
  cross join lateral regexp_matches(
    regexp_replace(part, '\m[A-Z][A-Z0-9&]*(?:\s+[A-Z][A-Z0-9&]*\M)+', ' ', 'g'),
    '\m([A-Z][A-Z0-9]{2,5})\M', 'g'
  ) as m
  where length(regexp_replace(part, '[^A-Z]', '', 'g')) * 2 <= length(regexp_replace(part, '[^A-Za-z]', '', 'g'))
    and m[1] <> all(v_generic_acr)
    and lower(m[1]) <> all(v_generic_org)
    and lower(m[1]) <> all(v_generic_proper)
    and lower(m[1]) <> all(v_broad)
    and lower(m[1]) <> all(v_stop)
    and not exists (
      select 1 from regexp_matches(v_source_raw, '\m(' || m[1] || ')\M', 'gi') as o where o[1] <> m[1]
    );

  select coalesce(array_agg(distinct lower(m[1])), '{}') into v_source_names
  from unnest(v_source_parts) as part
  cross join lateral regexp_matches(part, '\m[a-z][a-z0-9''-]*[,;:)]?\s+([A-Z][a-z]{3,})\M', 'g') as m
  where lower(m[1]) <> all(v_generic_org)
    and lower(m[1]) <> all(v_generic_proper)
    and lower(m[1]) <> all(v_broad)
    and lower(m[1]) <> all(v_stop)
    and v_source_raw !~ ('\m' || lower(m[1]) || '\M');

  -- Direct identifiers -------------------------------------------------------
  return query select 'URL'::text, 'HIGH'::public.leakage_risk, left(m[1], 120)
    from regexp_matches(v_all, '((?:https?://|www\.)[^[:space:]]+)', 'gi') as m;

  return query select 'EMAIL'::text, 'HIGH'::public.leakage_risk, left(m[1], 120)
    from regexp_matches(v_all, '([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})', 'gi') as m;

  return query select 'DOMAIN'::text, 'HIGH'::public.leakage_risk, left(m[1], 120)
    from regexp_matches(v_all, '\m([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:uk|com|org|gov|eu|io|info|scot|wales|cymru))\M', 'gi') as m;

  for v_m in select regexp_matches(v_all, '(\+?[0-9][0-9 ().-]{8,18}[0-9])', 'g') loop
    v_digits := regexp_replace(v_m[1], '[^0-9]', '', 'g');
    if length(v_digits) between 10 and 13 and (v_digits like '0%' or v_digits like '44%') then
      return query select 'PHONE'::text, 'HIGH'::public.leakage_risk, v_m[1];
    end if;
  end loop;

  return query select 'OCID'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m(ocds-[a-z0-9]{3,}-[a-z0-9-]+)', 'gi') as m;

  return query select 'REFERENCE_ID'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m([0-9]{6,}-[0-9]{4})\M', 'g') as m;

  return query select 'REFERENCE_ID'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\M', 'gi') as m;

  for v_term in
    select distinct btrim(x)
    from (
      select unnest(array[d.reference, d.ocid, d.external_primary_id]) as x
      union all select n.notice_identifier from public.notices n where n.deal_id = d.id
      union all select n.release_id from public.notices n where n.deal_id = d.id
      union all select pod.rfp_number from public.private_opportunity_details pod where pod.deal_id = d.id
      union all select pod.rfq_number from public.private_opportunity_details pod where pod.deal_id = d.id
      union all select c.contract_identifier from public.contracts c where c.deal_id = d.id
      union all select a.award_identifier from public.awards a where a.deal_id = d.id
      union all select l.source_lot_id from public.lots l where l.deal_id = d.id
      union all select oi.value from public.organization_identifiers oi where oi.organization_id = d.buyer_organization_id
    ) refs
    where x is not null
  loop
    v_norm := private.leak_norm(v_term);
    if v_term ~ '[0-9]' and length(btrim(v_norm)) >= 5 and position(v_norm in v_all_norm) > 0 then
      return query select 'REFERENCE_ID'::text, 'HIGH'::public.leakage_risk, v_term;
    end if;
  end loop;

  return query select 'REFERENCE_PATTERN'::text, 'REVIEW'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m(([A-Za-z]{1,6})[-/_.]?[0-9]{3,}(?:[-/_.][A-Za-z0-9]+)*)\M', 'g') as m
    where lower(m[2]) <> all(v_ref_prefix);

  -- Dates --------------------------------------------------------------------
  foreach v_term in array array[
    '\m([0-3]?[0-9](?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?))\M',
    '\m([0-3]?[0-9](?:st|nd|rd|th)?\s+(?:of\s+)?may,?\s+(?:19|20)[0-9]{2})\M',
    '\m((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+[0-3]?[0-9](?:st|nd|rd|th)?)\M',
    '\m(may\s+[0-3]?[0-9](?:st|nd|rd|th)?,?\s+(?:19|20)[0-9]{2})\M',
    '\m([0-3]?[0-9][/.-][01]?[0-9][/.-](?:19|20)?[0-9]{2})\M',
    '\m((?:19|20)[0-9]{2}[/.-][01]?[0-9][/.-][0-3]?[0-9])\M',
    '\m([0-3]?[0-9](?:st|nd|rd|th)?\s+(?:of\s+)?may)\M(?!\s+(?:be|not|also|apply|have|include|need|require|vary|change|only|still|well)\M)',
    '\m(may\s+[0-3]?[0-9](?:st|nd|rd|th)?)\M',
    '(?<![0-9/.])((?:0?[1-9]|[12][0-9]|3[01])/(?:0?[1-9]|1[0-2]))(?![0-9/])',
    '\m([0-3]?[0-9]-(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:-(?:19|20)?[0-9]{2})?)\M'
  ]
  loop
    return query select 'DATE_EXACT'::text, 'REVIEW'::public.leakage_risk, m[1]
      from regexp_matches(v_all, v_term, 'gi') as m
      where m[1] <> '24/7';
  end loop;

  -- Source dates in Europe/London, +/- one day, in common written forms.
  for v_term in
    with src(dt) as (
      select (x at time zone 'Europe/London')::date
      from unnest(array[d.enquiry_deadline, d.submission_deadline, d.first_published_at]) as x
      where x is not null
      union
      select x
      from unnest(array[
        d.award_decision_date, d.contract_start_date, d.contract_end_date, d.extension_end_date,
        d.next_procurement_date, d.estimated_renewal_date
      ]) as x
      where x is not null
      union
      select (pod.expression_of_interest_deadline at time zone 'Europe/London')::date
      from public.private_opportunity_details pod
      where pod.deal_id = d.id and pod.expression_of_interest_deadline is not null
      union
      select pod.anticipated_award_date
      from public.private_opportunity_details pod
      where pod.deal_id = d.id and pod.anticipated_award_date is not null
      union
      select (n.published_at at time zone 'Europe/London')::date
      from public.notices n
      where n.deal_id = d.id and n.published_at is not null
      union
      select (l.submission_deadline at time zone 'Europe/London')::date
      from public.lots l
      where l.deal_id = d.id and l.submission_deadline is not null
      union
      select x
      from public.lots l, unnest(array[l.contract_start_date, l.contract_end_date]) as x
      where l.deal_id = d.id and x is not null
      union
      select a.award_date from public.awards a where a.deal_id = d.id and a.award_date is not null
      union
      select x
      from public.contracts c, unnest(array[c.start_date, c.end_date]) as x
      where c.deal_id = d.id and x is not null
    ),
    days(dt) as (
      select distinct s.dt + o
      from src s
      cross join generate_series(-1, 1) as o
    )
    select distinct to_char(days.dt, f)
    from days
    cross join unnest(array[
      'YYYY-MM-DD', 'DD/MM/YYYY', 'FMDD/FMMM/YYYY', 'DD/MM/YY', 'FMDD FMMonth',
      'FMDDth FMMonth', 'FMDD Mon', 'FMDDth Mon', 'FMMonth FMDD', 'FMMonth FMDDth', 'Mon FMDD',
      'DD/MM', 'FMDD/FMMM'
    ]) as f
  loop
    -- Yearless numeric forms only count with digit/slash boundaries, so a
    -- "14 03" in other text is not a hit.
    if (v_term ~ '^[0-9]+/[0-9]+$' and v_all_lower ~ ('(?<![0-9/.])' || v_term || '(?![0-9/])'))
       or (v_term !~ '^[0-9]+/[0-9]+$' and position(private.leak_norm(v_term) in v_all_norm) > 0)
    then
      return query select 'DATE_SOURCE'::text, 'HIGH'::public.leakage_risk, v_term;
    end if;
  end loop;

  -- Postcodes and places -----------------------------------------------------
  return query select 'POSTCODE'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m([A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2})\M', 'gi') as m;

  for v_term in
    select distinct upper(left(c, length(c) - 3))
    from (
      select regexp_replace(upper(pc), '[^A-Z0-9]', '', 'g') as c
      from (
        select b2.postcode as pc from public.organizations b2 where b2.id = d.buyer_organization_id
        union all
        select o.postcode
        from public.deal_organizations dorg
        join public.organizations o on o.id = dorg.organization_id
        where dorg.deal_id = d.id
        union all
        select loc.postcode
        from public.deal_locations dl
        join public.locations loc on loc.id = dl.location_id
        where dl.deal_id = d.id
        union all
        select m[1]
        from regexp_matches(coalesce(v_source_raw, '') || ' ' || coalesce(d.exact_location_text, ''), '\m([A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2})\M', 'gi') as m
      ) pcs
      where pc is not null
    ) compact
    where c ~ '^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$'
  loop
    if v_all ~* ('\m' || v_term || '\M') then
      return query select 'POSTCODE_KNOWN_OUTWARD'::text, 'HIGH'::public.leakage_risk, v_term;
    end if;
  end loop;

  return query select 'POSTCODE_OUTWARD'::text, 'REVIEW'::public.leakage_risk, m[1]
    from regexp_matches(v_text_cs, '\m([A-Z]{1,2}[0-9][A-Z0-9]?)\M', 'g') as m
    where m[1] <> all(v_postcode_like);

  -- Slugs are lowercase, so postcode-shaped slug words are checked separately.
  return query select 'POSTCODE_OUTWARD'::text, 'REVIEW'::public.leakage_risk, upper(w)
    from unnest(v_slug_tokens) as w
    where w ~ '^[a-z]{1,2}[0-9][a-z0-9]?$' and upper(w) <> all(v_postcode_like);

  if d.buyer_organization_id is not null then
    select * into b from public.organizations where id = d.buyer_organization_id;
    v_has_buyer := found;
  end if;

  for v_term in
    select distinct btrim(part)
    from (
      select regexp_split_to_table(x, '[,;/|()]') as part
      from (
        select d.exact_location_text as x
        union all select l.exact_location_text from public.lots l where l.deal_id = d.id
      ) s
      where x is not null
      union all
      select unnest(array[loc.city, loc.county])
      from public.deal_locations dl
      join public.locations loc on loc.id = dl.location_id
      where dl.deal_id = d.id
      union all
      select unnest(array[b.city, b.county, b.address_line_1, b.address_line_2])
      where v_has_buyer
    ) parts
    where part is not null
  loop
    v_norm := private.leak_norm(v_term);
    if length(btrim(v_norm)) >= 4
       and btrim(v_norm) <> all(v_broad)
       and v_norm <> private.leak_norm(p_broad_region)
       and exists (
         select 1
         from unnest(string_to_array(btrim(v_norm), ' ')) as w
         where w <> all(v_generic_org) and w <> all(v_broad) and w !~ '^[0-9]+$'
       )
       and position(v_norm in v_all_norm) > 0
    then
      return query select 'LOCATION_EXACT'::text, 'HIGH'::public.leakage_risk, v_term;
    end if;
  end loop;

  -- Buyer identity -----------------------------------------------------------
  if v_has_buyer then
    v_norm := private.leak_norm(b.canonical_name);
    if length(btrim(v_norm)) >= 3 and position(v_norm in v_all_norm) > 0 then
      return query select 'BUYER_NAME'::text, 'HIGH'::public.leakage_risk, b.canonical_name;
    elsif b.leak_match_name is not null and position(b.leak_match_name in v_all_norm) > 0 then
      return query select 'BUYER_NAME'::text, 'HIGH'::public.leakage_risk, b.canonical_name;
    end if;

    for v_term in
      select a.alias from public.organization_aliases a where a.organization_id = b.id
    loop
      v_label := replace(v_term, '.', '');
      -- Acronym-style aliases: all caps, or mixed case with two or more capitals.
      if v_label ~ '^[A-Za-z0-9&]{2,12}$'
         and ((v_label ~ '[A-Z]' and v_label !~ '[a-z]') or v_label ~ '[A-Z][^A-Z]*[A-Z]')
      then
        if v_label = any(v_cs_tokens)
           or (length(v_label) >= 3
               and upper(v_label) <> all(v_generic_acr)
               and lower(v_label) <> all(v_generic_org)
               and lower(v_label) <> all(v_generic_proper)
               and lower(v_label) <> all(v_stop)
               and position(private.leak_norm(v_label) in v_all_norm) > 0)
        then
          return query select 'BUYER_ACRONYM'::text, 'HIGH'::public.leakage_risk, v_term;
        end if;
        continue;
      end if;
      v_norm := private.leak_norm(v_term);
      if length(btrim(v_norm)) >= 4
         and exists (
           select 1 from unnest(string_to_array(btrim(v_norm), ' ')) as w
           where w <> all(v_generic_org) and w <> all(v_broad)
         )
         and position(v_norm in v_all_norm) > 0
      then
        return query select 'BUYER_ALIAS'::text, 'HIGH'::public.leakage_risk, v_term;
      elsif length(btrim(v_norm)) between 2 and 3
         and btrim(v_norm) <> all(v_generic_org)
         and btrim(v_norm) <> all(v_broad)
         and btrim(v_norm) <> all(v_stop)
         and upper(btrim(v_norm)) <> all(v_generic_acr)
         and position(v_norm in v_all_norm) > 0
      then
        return query select 'BUYER_ALIAS'::text, 'REVIEW'::public.leakage_risk, v_term;
      end if;
    end loop;

    for v_term in
      select distinct lower(regexp_replace(x, '^www\.', ''))
      from (
        select b.domain as x
        union all select regexp_replace(lower(b.website), '^[a-z][a-z0-9+.-]*://([^/:?#]+).*$', '\1')
        union all select split_part(b.email, '@', 2)
      ) hosts
      where x is not null and length(x) >= 4
    loop
      if position(v_term in v_all_lower) > 0 then
        return query select 'BUYER_DOMAIN'::text, 'HIGH'::public.leakage_risk, v_term;
      else
        v_label := split_part(v_term, '.', 1);
        if length(v_label) >= 5
           and v_label <> all(v_generic_org)
           and position(' ' || v_label || ' ' in v_all_norm) > 0
        then
          return query select 'BUYER_DOMAIN'::text, 'HIGH'::public.leakage_risk, v_label;
        end if;
      end if;
    end loop;

    for v_term in
      select distinct w
      from unnest(string_to_array(btrim(private.leak_norm(b.canonical_name)), ' ')) as w
      where length(w) >= 4
        and w !~ '^[0-9]+$'
        and w <> all(v_generic_org)
        and w <> all(v_generic_proper)
        and w <> all(v_broad)
        and w <> all(v_stop)
    loop
      if position(' ' || v_term || ' ' in v_all_norm) > 0 then
        return query select 'BUYER_TOKEN'::text,
          (case when length(v_term) >= 5 then 'HIGH' else 'REVIEW' end)::public.leakage_risk,
          v_term;
      end if;
    end loop;

    for v_term in
      select upper(string_agg(left(w, 1), '' order by ord))
      from unnest(string_to_array(btrim(private.leak_norm(b.canonical_name)), ' ')) with ordinality as t(w, ord)
      where w not in ('and', 'of', 'the', 'for') and w !~ '^[0-9]+$'
      union
      select upper(string_agg(left(w, 1), '' order by ord))
      from unnest(string_to_array(btrim(b.leak_match_name), ' ')) with ordinality as t(w, ord)
      where w not in ('and', 'of', 'the', 'for') and w !~ '^[0-9]+$'
    loop
      if v_term is not null and length(v_term) >= 3
         and (v_term = any(v_cs_tokens) or (length(v_term) >= 4 and lower(v_term) = any(v_slug_tokens)))
      then
        return query select 'BUYER_ACRONYM'::text, 'HIGH'::public.leakage_risk, v_term;
      end if;
    end loop;
  end if;

  for v_term in
    select distinct lower(regexp_replace(regexp_replace(lower(u), '^[a-z][a-z0-9+.-]*://([^/:?#]+).*$', '\1'), '^www\.', ''))
    from unnest(array[d.source_url, d.application_url]) as u
    where u is not null
  loop
    if length(v_term) >= 4 and position(v_term in v_all_lower) > 0 then
      return query select 'BUYER_DOMAIN'::text, 'HIGH'::public.leakage_risk, v_term;
    end if;
  end loop;

  -- Any known organisation (buyers, suppliers, incumbents) -------------------
  for v_term, v_norm in
    select o.canonical_name, o.leak_match_name
    from public.organizations o
    where o.leak_match_name is not null and position(o.leak_match_name in v_all_norm) > 0
    union
    select a.alias, a.leak_match_name
    from public.organization_aliases a
    where a.leak_match_name is not null and position(a.leak_match_name in v_all_norm) > 0
  loop
    select count(*) into v_count
    from unnest(string_to_array(btrim(v_norm), ' ')) as w
    where w <> all(v_generic_org) and w <> all(v_broad) and w <> all(v_stop) and w !~ '^[0-9]+$'
      and (length(btrim(v_norm)) >= 5 or (upper(w) <> all(v_generic_acr) and w <> all(v_generic_proper)));
    if v_count >= 2 then
      return query select 'ORG_NAME'::text, 'HIGH'::public.leakage_risk, v_term;
    elsif v_count = 1 then
      return query select 'ORG_NAME'::text, 'REVIEW'::public.leakage_risk, v_term;
    end if;
  end loop;

  for v_term in
    select distinct w
    from (
      select o.canonical_name as n
      from public.deal_organizations dorg
      join public.organizations o on o.id = dorg.organization_id
      where dorg.deal_id = d.id
      union
      select o.canonical_name
      from public.awards aw
      join public.award_suppliers s on s.award_id = aw.id
      join public.organizations o on o.id = s.organization_id
      where aw.deal_id = d.id
      union
      select o.canonical_name
      from public.deal_insights di
      join public.organizations o on o.id = di.incumbent_organization_id
      where di.deal_id = d.id
    ) names
    cross join lateral unnest(string_to_array(btrim(private.leak_norm(names.n)), ' ')) as w
    where length(w) >= 4
      and w !~ '^[0-9]+$'
      and w <> all(v_generic_org)
      and w <> all(v_generic_proper)
      and w <> all(v_broad)
      and w <> all(v_stop)
  loop
    if position(' ' || v_term || ' ' in v_all_norm) > 0 then
      return query select 'ORG_TOKEN'::text,
        (case when length(v_term) >= 5 then 'HIGH' else 'REVIEW' end)::public.leakage_risk,
        v_term;
    end if;
  end loop;

  return query select 'ORG_SUFFIX'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_text_cs, '((?:[A-Z][A-Za-z0-9&-]*\s+){1,4}(?:Ltd|LTD|Limited|LIMITED|LLP|PLC|Plc|plc|LLC|Inc|CIC))\M', 'g') as m;

  return query select 'ORG_SUFFIX'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m(ltd|llp)\M', 'gi') as m;

  -- Project / programme names ------------------------------------------------
  for v_term in
    select pod.project_name
    from public.private_opportunity_details pod
    where pod.deal_id = d.id and pod.project_name is not null
  loop
    v_norm := private.leak_norm(v_term);
    if length(btrim(v_norm)) >= 5 and position(v_norm in v_all_norm) > 0 then
      return query select 'PROJECT_NAME'::text, 'HIGH'::public.leakage_risk, v_term;
    end if;
    return query
      select 'PROJECT_NAME'::text,
        (case when length(w) >= 5 then 'HIGH' else 'REVIEW' end)::public.leakage_risk,
        w
      from (
        select distinct w
        from unnest(string_to_array(btrim(v_norm), ' ')) as w
        where length(w) >= 4
          and w !~ '^[0-9]+$'
          and w <> all(v_generic_org)
          and w <> all(v_generic_proper)
          and w <> all(v_broad)
          and w <> all(v_stop)
      ) tokens
      where position(' ' || w || ' ' in v_all_norm) > 0;
  end loop;

  for v_m in select regexp_matches(v_text_cs, '\m([A-Z][A-Z0-9&]{2,})\M', 'g') loop
    if v_m[1] <> all(v_generic_acr) then
      v_norm := private.leak_norm(v_m[1]);
      return query select 'ACRONYM'::text,
        (case when length(btrim(v_norm)) >= 3 and position(v_norm in v_source_norm) > 0 then 'HIGH' else 'REVIEW' end)::public.leakage_risk,
        v_m[1];
    end if;
  end loop;

  -- Title-Case runs inside sentence-case prose (site/programme names).
  foreach v_seg in array v_prose_segments loop
    for v_m in select regexp_matches(v_seg, '\m[a-z][a-z0-9''-]*[,;:)]?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)', 'g') loop
      select count(*) into v_count
      from unnest(string_to_array(btrim(private.leak_norm(v_m[1])), ' ')) as w
      where w <> all(v_generic_proper) and w <> all(v_generic_org) and w <> all(v_broad);
      if v_count > 0 then
        return query select 'PROPER_NOUN_RUN'::text,
          (case when position(private.leak_norm(v_m[1]) in v_source_norm) > 0 then 'HIGH' else 'REVIEW' end)::public.leakage_risk,
          v_m[1];
      end if;
    end loop;
  end loop;

  return query select 'SOURCE_NAME_TOKEN'::text, 'HIGH'::public.leakage_risk, w
    from unnest(v_source_acronyms) as w
    where position(' ' || w || ' ' in v_all_norm) > 0;

  return query select 'SOURCE_NAME_TOKEN'::text,
      (case when length(w) >= 5 then 'HIGH' else 'REVIEW' end)::public.leakage_risk,
      w
    from unnest(v_source_names) as w
    where position(' ' || w || ' ' in v_all_norm) > 0;

  -- Similarity and copied phrases -------------------------------------------
  if length(btrim(coalesce(d.source_title, ''))) >= 4 then
    v_sim := extensions.similarity(lower(d.source_title), lower(coalesce(p_preview_title, '')));
    if v_sim >= 0.9 then
      return query select 'TITLE_SIMILARITY'::text, 'HIGH'::public.leakage_risk, to_char(v_sim, 'FM0.00');
    elsif v_sim >= 0.8 then
      return query select 'TITLE_SIMILARITY'::text, 'REVIEW'::public.leakage_risk, to_char(v_sim, 'FM0.00');
    end if;

    if btrim(v_slug_norm) <> '' then
      v_sim := extensions.similarity(lower(d.source_title), btrim(v_slug_norm));
      if v_sim >= 0.9 then
        return query select 'SLUG_SIMILARITY'::text, 'HIGH'::public.leakage_risk, to_char(v_sim, 'FM0.00');
      elsif v_sim >= 0.8 then
        return query select 'SLUG_SIMILARITY'::text, 'REVIEW'::public.leakage_risk, to_char(v_sim, 'FM0.00');
      end if;
    end if;
  end if;

  if length(btrim(coalesce(d.source_description, ''))) >= 40 then
    v_sim := extensions.similarity(lower(d.source_description), lower(coalesce(p_preview_summary, '')));
    if v_sim >= 0.85 then
      return query select 'DESCRIPTION_SIMILARITY'::text, 'HIGH'::public.leakage_risk, to_char(v_sim, 'FM0.00');
    elsif v_sim >= 0.55 then
      return query select 'DESCRIPTION_SIMILARITY'::text, 'REVIEW'::public.leakage_risk, to_char(v_sim, 'FM0.00');
    end if;
  end if;

  foreach v_seg in array v_segments loop
    v_words := string_to_array(btrim(private.leak_norm(v_seg)), ' ');
    if coalesce(cardinality(v_words), 0) >= 6 then
      for i in 1 .. cardinality(v_words) - 5 loop
        v_window := ' ' || array_to_string(v_words[i:i + 5], ' ') || ' ';
        select count(*) into v_count from unnest(v_words[i:i + 5]) as w where w <> all(v_stop);
        if v_count >= 2 and position(v_window in v_source_norm) > 0 then
          return query select 'PHRASE_OVERLAP'::text, 'HIGH'::public.leakage_risk, btrim(v_window);
          exit;
        end if;
      end loop;
    end if;
  end loop;

  -- Exact amounts ------------------------------------------------------------
  select coalesce(array_agg(distinct x), '{}') into v_amounts
  from (
    select round(v)::bigint::text as x
    from unnest(array[d.value_min_ex_vat, d.value_max_ex_vat]) as v
    where v is not null
    union all
    select round(v)::bigint::text
    from public.lots l, unnest(array[l.value_min, l.value_max]) as v
    where l.deal_id = d.id and v is not null
    union all
    select round(a.award_value)::bigint::text from public.awards a where a.deal_id = d.id and a.award_value is not null
    union all
    select round(v)::bigint::text
    from public.contracts c, unnest(array[c.original_value, c.current_value]) as v
    where c.deal_id = d.id and v is not null
    union all
    select regexp_replace(d.exact_value_text, '[^0-9]', '', 'g') where d.exact_value_text is not null
  ) amounts
  where length(x) >= 5;

  return query select 'EXACT_AMOUNT'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '(£\s?[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?)', 'g') as m;

  return query select 'EXACT_AMOUNT'::text, 'HIGH'::public.leakage_risk, m[1]
    from regexp_matches(v_all, '\m([0-9]{5,}(?:\.[0-9]{1,2})?)\M', 'g') as m
    where split_part(m[1], '.', 1) = any(v_amounts);

  -- Source platform ----------------------------------------------------------
  return query
    select 'SOURCE_PLATFORM'::text, 'HIGH'::public.leakage_risk, marker
    from (
      select unnest(v_platforms) as marker
      union
      select source_marker
      from (
        select lower(ds.name) as source_marker from public.data_sources ds where ds.id = d.primary_source_id
        union
        select lower(ds.source_key) from public.data_sources ds where ds.id = d.primary_source_id
        union
        select replace(lower(ds.source_key), '-', ' ') from public.data_sources ds where ds.id = d.primary_source_id
      ) source_markers
      where length(source_marker) >= 5
        and exists (
          select 1 from unnest(string_to_array(btrim(private.leak_norm(source_marker)), ' ')) as w
          where w <> all(v_generic_org) and w <> all(v_broad)
        )
    ) markers
    where position(marker in v_all_lower) > 0
       or position(private.leak_norm(marker) in v_all_norm) > 0;

  -- Combination risk: distinctive words carried from the source that pin the
  -- preview to fewer than three deals.
  select coalesce(array_agg(w order by length(w) desc, w), '{}') into v_carried
  from (
    select distinct w
    from unnest(string_to_array(btrim(private.leak_norm(concat_ws(' . ', array_to_string(v_segments, ' . '), v_slug))), ' ')) as w
    where length(w) >= 5
      and w !~ '^[0-9]+$'
      and w <> all(v_generic_org)
      and w <> all(v_generic_proper)
      and w <> all(v_broad)
      and w <> all(v_stop)
      and position(' ' || w || ' ' in v_source_norm) > 0
  ) carried;

  if cardinality(v_carried) >= 3 then
    v_carried := v_carried[1:4];
    select count(*) into v_k
    from (
      select 1
      from public.deals x
      where x.id <> d.id
        and to_tsvector('simple'::regconfig, coalesce(x.source_title, '') || ' ' || coalesce(x.source_description, ''))
            @@ plainto_tsquery('simple'::regconfig, array_to_string(v_carried, ' '))
      limit 2
    ) others;
    if v_k + 1 < 3 then
      return query select 'COMBINATION'::text, 'REVIEW'::public.leakage_risk, array_to_string(v_carried, ' + ');
    end if;
  end if;

  return;
end;
$$;

revoke execute on function private.preview_leak_findings(uuid, text, text, text, jsonb, text[], text)
  from public, anon, authenticated;
grant execute on function private.preview_leak_findings(uuid, text, text, text, jsonb, text[], text)
  to service_role;

comment on function private.preview_leak_findings(uuid, text, text, text, jsonb, text[], text) is
  'Preview leak gate v2 findings. Tokens can contain protected values; service-role/admin only.';

create or replace function private.detect_preview_leakage(
  p_deal_id uuid,
  p_slug text,
  p_preview_title text,
  p_preview_summary text,
  p_requirements jsonb,
  p_relevance_tags text[] default '{}'::text[],
  p_broad_region text default null
)
returns public.leakage_risk
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(f.finding_risk), 'LOW'::public.leakage_risk)
  from private.preview_leak_findings(
    p_deal_id, p_slug, p_preview_title, p_preview_summary, p_requirements, p_relevance_tags, p_broad_region
  ) as f;
$$;

revoke execute on function private.detect_preview_leakage(uuid, text, text, text, jsonb, text[], text)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Admin holds. Recorded per deal (not per preview row) so deleting and
-- re-inserting the preview cannot clear them, and kept in a table no API role
-- can read or write. Only public.admin_release_preview_hold deletes a hold.
-- -----------------------------------------------------------------------------
create table if not exists private.preview_holds (
  deal_id uuid primary key references public.deals(id) on delete cascade,
  held_at timestamptz not null default now()
);

revoke all on table private.preview_holds from public, anon, authenticated, service_role;

insert into private.preview_holds (deal_id)
select dp.deal_id from public.deal_previews dp where dp.unpublished_by_admin
on conflict (deal_id) do nothing;

-- -----------------------------------------------------------------------------
-- Publish gate. Runs on every INSERT/UPDATE (all columns) and fires even under
-- session_replication_role = replica. The detected risk can only raise the
-- stored risk; anything other than LOW, or an admin hold, forces unpublished.
-- -----------------------------------------------------------------------------
create or replace function private.enforce_preview_safety()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  detected public.leakage_risk;
begin
  if exists (select 1 from private.preview_holds h where h.deal_id = new.deal_id) then
    new.unpublished_by_admin := true;
  elsif new.unpublished_by_admin then
    insert into private.preview_holds (deal_id) values (new.deal_id)
    on conflict (deal_id) do nothing;
  end if;

  begin
    detected := private.detect_preview_leakage(
      new.deal_id,
      new.slug,
      new.preview_title,
      new.preview_summary,
      new.requirements_preview,
      new.relevance_tags,
      new.broad_region
    );
  exception when others then
    raise warning 'preview leak gate failed for deal %: %', new.deal_id, sqlerrm;
    detected := 'REVIEW';
  end;

  if detected > new.leakage_risk then
    new.leakage_risk := detected;
  end if;

  if new.leakage_risk <> 'LOW' then
    new.is_published := false;
  end if;

  if new.unpublished_by_admin then
    new.is_published := false;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_preview_safety() from public, anon, authenticated;

drop trigger if exists enforce_preview_safety on public.deal_previews;
create trigger enforce_preview_safety
before insert or update
on public.deal_previews
for each row execute function private.enforce_preview_safety();

alter table public.deal_previews enable always trigger enforce_preview_safety;

drop function if exists private.detect_preview_leakage(uuid, text, text, jsonb);

create or replace function public.admin_release_preview_hold(p_deal_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  delete from private.preview_holds where deal_id = p_deal_id;
  update public.deal_previews
  set unpublished_by_admin = false,
      is_published = false
  where deal_id = p_deal_id;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke execute on function public.admin_release_preview_hold(uuid) from public, anon, authenticated;
grant execute on function public.admin_release_preview_hold(uuid) to service_role;

comment on function public.admin_release_preview_hold(uuid) is
  'Service-role only. The sole path that clears unpublished_by_admin; called after an application ADMIN check.';

-- -----------------------------------------------------------------------------
-- Fail-closed entitlement: a missing current_period_end never grants Pro.
-- Mirrors isPaidThrough() in lib/entitlements/policy.ts.
-- -----------------------------------------------------------------------------
create or replace function private.is_user_pro(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = p_user_id
      and s.is_current = true
      and s.current_period_end is not null
      and s.current_period_end > now()
      and (
        s.status = 'ACTIVE'
        or (s.status = 'CANCELLED' and s.cancel_at_period_end = true)
      )
  );
$$;

revoke execute on function private.is_user_pro(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Sanitised preview DTO RPCs. SECURITY DEFINER so client roles never need
-- table access to deal_previews; they return no deal_id, timestamps, source,
-- buyer, reference, contact or document fields.
-- -----------------------------------------------------------------------------
create or replace function private.preview_dto_requirements(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(s.t) order by s.ord), '[]'::jsonb)
  from (
    select x.t, x.ord
    from (
      select
        btrim(
          case jsonb_typeof(e)
            when 'string' then e #>> '{}'
            when 'object' then coalesce(e ->> 'text', e ->> 'label')
          end
        ) as t,
        ord
      from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end)
        with ordinality as a(e, ord)
    ) x
    where x.t is not null and x.t <> '' and length(x.t) <= 500
    order by x.ord
    limit 20
  ) s;
$$;

create or replace function private.preview_freshness_label(p_created_at timestamptz, p_updated_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_created_at >= now() - interval '7 days' then 'New this week'
    when p_updated_at >= now() - interval '7 days' then 'Updated this week'
    else 'Open opportunity'
  end;
$$;

revoke execute on function private.preview_dto_requirements(jsonb) from public, anon, authenticated;
revoke execute on function private.preview_freshness_label(timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.search_preview_dtos(
  p_query text default null,
  p_category text default null,
  p_buyer_sector public.buyer_sector default null,
  p_deal_type public.deal_type default null,
  p_region text default null,
  p_status public.deal_status default null,
  p_statuses public.deal_status[] default null,
  p_value_band text default null,
  p_deadline_band text default null,
  p_min_score numeric default null,
  p_sort text default 'updated',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  slug text,
  preview_title text,
  preview_summary text,
  deal_type public.deal_type,
  buyer_sector public.buyer_sector,
  stage public.deal_stage,
  status public.deal_status,
  main_category text,
  broad_region text,
  value_band text,
  deadline_band text,
  duration_band text,
  sme_suitability text,
  bid_complexity text,
  competition_level text,
  requirements_preview jsonb,
  relevance_tags text[],
  freshness_label text,
  relevance_score numeric,
  preview_reasons jsonb,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select cp.id as company_profile_id
    from public.company_profiles cp
    where cp.user_id = auth.uid()
    limit 1
  ),
  q as (
    select nullif(btrim(left(coalesce(p_query, ''), 200)), '') as text
  ),
  ranked as (
    select
      dp.*,
      dm.relevance_score as match_score,
      dm.preview_reasons as match_reasons,
      case
        when q.text is null then 0
        else ts_rank(
          to_tsvector('english'::regconfig, coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, '')),
          websearch_to_tsquery('english'::regconfig, q.text)
        )
      end as query_rank
    from public.deal_previews dp
    cross join q
    left join viewer v on true
    left join public.deal_matches dm
      on dm.deal_id = dp.deal_id
     and dm.company_profile_id = v.company_profile_id
    where dp.is_published = true
      and dp.leakage_risk = 'LOW'
      and dp.unpublished_by_admin = false
      and (p_category is null or dp.main_category = p_category)
      and (p_buyer_sector is null or dp.buyer_sector = p_buyer_sector)
      and (p_deal_type is null or dp.deal_type = p_deal_type)
      and (p_region is null or dp.broad_region = p_region)
      and (p_status is null or dp.status = p_status)
      and (p_statuses is null or cardinality(p_statuses) = 0 or dp.status = any(p_statuses))
      and (p_value_band is null or dp.value_band = p_value_band)
      and (p_deadline_band is null or dp.deadline_band = p_deadline_band)
      and (p_min_score is null or coalesce(dm.relevance_score, -1) >= p_min_score)
      and (
        q.text is null
        or to_tsvector('english'::regconfig, coalesce(dp.preview_title, '') || ' ' || coalesce(dp.preview_summary, '') || ' ' || coalesce(dp.main_category, ''))
             @@ websearch_to_tsquery('english'::regconfig, q.text)
        or dp.preview_title operator(extensions.%) q.text
      )
  )
  select
    r.slug,
    r.preview_title,
    r.preview_summary,
    r.deal_type,
    r.buyer_sector,
    r.stage,
    r.status,
    r.main_category,
    r.broad_region,
    r.value_band,
    r.deadline_band,
    r.duration_band,
    r.sme_suitability,
    r.bid_complexity,
    r.competition_level,
    private.preview_dto_requirements(r.requirements_preview),
    r.relevance_tags[1:12],
    private.preview_freshness_label(r.created_at, r.updated_at),
    r.match_score,
    coalesce(r.match_reasons, '[]'::jsonb),
    count(*) over ()
  from ranked r
  order by
    case when lower(coalesce(p_sort, 'updated')) = 'relevance' then coalesce(r.match_score, -1) else 0 end desc,
    r.query_rank desc,
    r.updated_at desc,
    r.slug
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(0, least(coalesce(p_offset, 0), 10000));
$$;

create or replace function public.get_preview_dto_by_slug(p_slug text)
returns table (
  slug text,
  preview_title text,
  preview_summary text,
  deal_type public.deal_type,
  buyer_sector public.buyer_sector,
  stage public.deal_stage,
  status public.deal_status,
  main_category text,
  broad_region text,
  value_band text,
  deadline_band text,
  duration_band text,
  sme_suitability text,
  bid_complexity text,
  competition_level text,
  requirements_preview jsonb,
  relevance_tags text[],
  freshness_label text,
  relevance_score numeric,
  preview_reasons jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    dp.slug,
    dp.preview_title,
    dp.preview_summary,
    dp.deal_type,
    dp.buyer_sector,
    dp.stage,
    dp.status,
    dp.main_category,
    dp.broad_region,
    dp.value_band,
    dp.deadline_band,
    dp.duration_band,
    dp.sme_suitability,
    dp.bid_complexity,
    dp.competition_level,
    private.preview_dto_requirements(dp.requirements_preview),
    dp.relevance_tags[1:12],
    private.preview_freshness_label(dp.created_at, dp.updated_at),
    dm.relevance_score,
    coalesce(dm.preview_reasons, '[]'::jsonb)
  from public.deal_previews dp
  left join public.company_profiles cp on cp.user_id = auth.uid()
  left join public.deal_matches dm
    on dm.deal_id = dp.deal_id
   and dm.company_profile_id = cp.id
  where length(coalesce(p_slug, '')) between 1 and 200
    and dp.slug = p_slug
    and dp.is_published = true
    and dp.leakage_risk = 'LOW'
    and dp.unpublished_by_admin = false
  limit 1;
$$;

create or replace function public.get_preview_dto_by_deal_id(p_deal_id uuid)
returns table (
  slug text,
  preview_title text,
  preview_summary text,
  deal_type public.deal_type,
  buyer_sector public.buyer_sector,
  stage public.deal_stage,
  status public.deal_status,
  main_category text,
  broad_region text,
  value_band text,
  deadline_band text,
  duration_band text,
  sme_suitability text,
  bid_complexity text,
  competition_level text,
  requirements_preview jsonb,
  relevance_tags text[],
  freshness_label text,
  relevance_score numeric,
  preview_reasons jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    dp.slug,
    dp.preview_title,
    dp.preview_summary,
    dp.deal_type,
    dp.buyer_sector,
    dp.stage,
    dp.status,
    dp.main_category,
    dp.broad_region,
    dp.value_band,
    dp.deadline_band,
    dp.duration_band,
    dp.sme_suitability,
    dp.bid_complexity,
    dp.competition_level,
    private.preview_dto_requirements(dp.requirements_preview),
    dp.relevance_tags[1:12],
    private.preview_freshness_label(dp.created_at, dp.updated_at),
    dm.relevance_score,
    coalesce(dm.preview_reasons, '[]'::jsonb)
  from public.deal_previews dp
  left join public.company_profiles cp on cp.user_id = auth.uid()
  left join public.deal_matches dm
    on dm.deal_id = dp.deal_id
   and dm.company_profile_id = cp.id
  where auth.uid() is not null
    and dp.deal_id = p_deal_id
    and dp.is_published = true
    and dp.leakage_risk = 'LOW'
    and dp.unpublished_by_admin = false
  limit 1;
$$;

create or replace function public.resolve_preview_deal_id(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select dp.deal_id
  from public.deal_previews dp
  where auth.uid() is not null
    and length(coalesce(p_slug, '')) between 1 and 200
    and dp.slug = p_slug
    and dp.is_published = true
    and dp.leakage_risk = 'LOW'
    and dp.unpublished_by_admin = false
  limit 1;
$$;

create or replace function public.list_saved_deal_previews()
returns table (
  saved_deal_id uuid,
  deal_id uuid,
  notes text,
  saved_at timestamptz,
  slug text,
  preview_title text,
  preview_summary text,
  deal_type public.deal_type,
  buyer_sector public.buyer_sector,
  stage public.deal_stage,
  status public.deal_status,
  main_category text,
  broad_region text,
  value_band text,
  deadline_band text,
  duration_band text,
  sme_suitability text,
  bid_complexity text,
  competition_level text,
  requirements_preview jsonb,
  relevance_tags text[],
  freshness_label text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    sd.id,
    sd.deal_id,
    sd.notes,
    sd.created_at,
    dp.slug,
    dp.preview_title,
    dp.preview_summary,
    dp.deal_type,
    dp.buyer_sector,
    dp.stage,
    dp.status,
    dp.main_category,
    dp.broad_region,
    dp.value_band,
    dp.deadline_band,
    dp.duration_band,
    dp.sme_suitability,
    dp.bid_complexity,
    dp.competition_level,
    case when dp.deal_id is null then null else private.preview_dto_requirements(dp.requirements_preview) end,
    dp.relevance_tags[1:12],
    case when dp.deal_id is null then null else private.preview_freshness_label(dp.created_at, dp.updated_at) end
  from public.saved_deals sd
  left join public.deal_previews dp
    on dp.deal_id = sd.deal_id
   and dp.is_published = true
   and dp.leakage_risk = 'LOW'
   and dp.unpublished_by_admin = false
  where sd.user_id = auth.uid()
  order by sd.created_at desc;
$$;

create or replace function public.list_preview_sitemap_entries(
  p_limit integer default 1000,
  p_offset integer default 0
)
returns table (
  slug text,
  preview_title text,
  preview_summary text,
  main_category text,
  broad_region text,
  value_band text,
  deadline_band text,
  status public.deal_status,
  last_modified date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    dp.slug,
    dp.preview_title,
    dp.preview_summary,
    dp.main_category,
    dp.broad_region,
    dp.value_band,
    dp.deadline_band,
    dp.status,
    date_trunc('week', dp.updated_at)::date
  from public.deal_previews dp
  where dp.is_published = true
    and dp.leakage_risk = 'LOW'
    and dp.unpublished_by_admin = false
  order by dp.updated_at desc, dp.slug
  limit greatest(1, least(coalesce(p_limit, 1000), 1000))
  offset greatest(0, least(coalesce(p_offset, 0), 1000000));
$$;

create or replace function public.count_preview_sitemap_entries()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from public.deal_previews dp
  where dp.is_published = true
    and dp.leakage_risk = 'LOW'
    and dp.unpublished_by_admin = false;
$$;

revoke all on function public.search_preview_dtos(
  text, text, public.buyer_sector, public.deal_type, text, public.deal_status, public.deal_status[],
  text, text, numeric, text, integer, integer
) from public;
revoke all on function public.get_preview_dto_by_slug(text) from public;
revoke all on function public.get_preview_dto_by_deal_id(uuid) from public;
revoke all on function public.resolve_preview_deal_id(text) from public;
revoke all on function public.list_saved_deal_previews() from public;
revoke all on function public.list_preview_sitemap_entries(integer, integer) from public;
revoke all on function public.count_preview_sitemap_entries() from public;

grant execute on function public.search_preview_dtos(
  text, text, public.buyer_sector, public.deal_type, text, public.deal_status, public.deal_status[],
  text, text, numeric, text, integer, integer
) to anon, authenticated, service_role;
grant execute on function public.get_preview_dto_by_slug(text) to anon, authenticated, service_role;
grant execute on function public.list_preview_sitemap_entries(integer, integer) to anon, authenticated, service_role;
grant execute on function public.count_preview_sitemap_entries() to anon, authenticated, service_role;
grant execute on function public.get_preview_dto_by_deal_id(uuid) to authenticated, service_role;
grant execute on function public.resolve_preview_deal_id(text) to authenticated, service_role;
grant execute on function public.list_saved_deal_previews() to authenticated, service_role;

comment on function public.search_preview_dtos is
  'Sanitised public/free preview search. No deal_id or timestamps. Relevance only for the caller''s own company profile (auth.uid()).';
comment on function public.get_preview_dto_by_slug(text) is
  'Sanitised preview DTO for one published LOW-risk slug.';
comment on function public.get_preview_dto_by_deal_id(uuid) is
  'Signed-in only. Sanitised preview DTO for a published deal id.';
comment on function public.resolve_preview_deal_id(text) is
  'Signed-in only. Maps a published slug to its internal deal id for save/reveal actions.';
comment on function public.list_saved_deal_previews() is
  'Signed-in only. The caller''s saved deals with sanitised previews (null when no longer published).';
