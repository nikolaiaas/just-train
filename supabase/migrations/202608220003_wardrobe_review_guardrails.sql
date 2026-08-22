begin;

-- Nullable provenance still needs an index for audit and editorial-history
-- lookups without indexing the service-created NULL case.
create index wardrobe_items_created_by_idx
  on public.wardrobe_items (created_by)
  where created_by is not null;

commit;
