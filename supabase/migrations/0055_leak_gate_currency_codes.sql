-- Leak gate: treat ISO 4217 currency codes as generic acronyms (mirrors
-- GENERIC_ACRONYMS in lib/redaction/gate-vocabulary.ts). Stops TED previews
-- quoting EUR/SEK/etc. from being held as uncommon acronyms.
insert into private.leak_gate_terms (kind, term) values
  ('generic_acronym', 'AUD'),
  ('generic_acronym', 'BGN'),
  ('generic_acronym', 'BRL'),
  ('generic_acronym', 'CHF'),
  ('generic_acronym', 'CNY'),
  ('generic_acronym', 'CZK'),
  ('generic_acronym', 'DKK'),
  ('generic_acronym', 'EUR'),
  ('generic_acronym', 'HKD'),
  ('generic_acronym', 'HUF'),
  ('generic_acronym', 'INR'),
  ('generic_acronym', 'ISK'),
  ('generic_acronym', 'JPY'),
  ('generic_acronym', 'MXN'),
  ('generic_acronym', 'NOK'),
  ('generic_acronym', 'NZD'),
  ('generic_acronym', 'PLN'),
  ('generic_acronym', 'RON'),
  ('generic_acronym', 'SEK'),
  ('generic_acronym', 'SGD'),
  ('generic_acronym', 'TRY'),
  ('generic_acronym', 'USD'),
  ('generic_acronym', 'ZAR')
on conflict do nothing;
