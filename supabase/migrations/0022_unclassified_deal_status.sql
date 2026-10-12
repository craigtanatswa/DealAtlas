-- Notices that are not a live tender or a dated planning notice.
alter type public.deal_status add value if not exists 'UNCLASSIFIED';
