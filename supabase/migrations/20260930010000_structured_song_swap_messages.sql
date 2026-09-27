begin;

alter table public.messages
  add column kind text not null default 'text',
  add column payload jsonb;

alter table public.messages
  add constraint messages_kind_check
    check (kind in ('text', 'song_swap')),
  add constraint messages_payload_shape_check
    check (
      (kind = 'text' and payload is null)
      or
      (
        kind = 'song_swap'
        and jsonb_typeof(payload) = 'object'
        and payload @> '{"version": 1}'::jsonb
        and jsonb_typeof(payload -> 'song') = 'object'
        and nullif(btrim(payload #>> '{song,title}'), '') is not null
        and nullif(btrim(payload #>> '{song,artist}'), '') is not null
        and nullif(btrim(payload ->> 'reason'), '') is not null
      )
    );

comment on column public.messages.kind is
  'Message discriminator. Existing rows are text; song_swap rows carry a versioned payload.';
comment on column public.messages.payload is
  'Versioned structured message data. Preview URLs are deliberately never persisted.';

commit;
