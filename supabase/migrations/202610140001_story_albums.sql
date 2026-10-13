begin;

create table public.story_albums (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(user_id),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  template text not null check (template in ('journal','cinema','postcard')),
  transition text not null check (transition in ('slide','fade','zoom')),
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index story_albums_recent on public.story_albums(owner_id,updated_at desc);
create index story_albums_shared on public.story_albums(updated_at desc) where is_shared;
create table public.story_album_photos (
  story_id uuid not null references public.story_albums(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  position integer not null check (position between 0 and 59),
  primary key(story_id,photo_id),
  unique(story_id,position)
);
create index story_album_photos_photo on public.story_album_photos(photo_id);
alter table public.story_albums enable row level security;
alter table public.story_album_photos enable row level security;
revoke all on public.story_albums,public.story_album_photos from public,anon,authenticated;
grant all on public.story_albums,public.story_album_photos to service_role;

create function public.album_v6_action(p_owner uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare story public.story_albums;
  photo_ids uuid[];
  requested_shared boolean;
  cnt integer;
begin
  if not exists(select 1 from public.profiles where user_id=p_owner and is_active) then
    raise exception 'NOT_MEMBER';
  end if;

  if p_action='list' then
    return jsonb_build_object('stories',coalesce((
      select jsonb_agg(to_jsonb(s)-'owner_id' || jsonb_build_object(
        'is_owner',s.owner_id=p_owner,
        'owner_name',owner_profile.display_name,
        'photo_count',(select count(*) from public.story_album_photos sp
          join public.photos p on p.id=sp.photo_id
          where sp.story_id=s.id and p.lifecycle_status='active'
            and (p.owner_id=p_owner or p.is_shared)),
        'cover_photo',(select public.album_photo_json(p) from public.story_album_photos sp
          join public.photos p on p.id=sp.photo_id
          where sp.story_id=s.id and p.lifecycle_status='active'
            and (p.owner_id=p_owner or p.is_shared)
          order by sp.position limit 1)) order by s.updated_at desc,s.id desc)
      from (select * from public.story_albums story_row
        where owner_id=p_owner or (is_shared and exists(
          select 1 from public.story_album_photos sp
          join public.photos p on p.id=sp.photo_id
          where sp.story_id=story_row.id and p.is_shared and p.lifecycle_status='active'))
        order by updated_at desc,id desc limit 100) s
      join public.profiles owner_profile on owner_profile.user_id=s.owner_id
    ),'[]'::jsonb));
  end if;

  if p_action='detail' then
    select * into story from public.story_albums story_row
      where id=(p_data->>'story_id')::uuid and (owner_id=p_owner or (is_shared and exists(
        select 1 from public.story_album_photos sp
        join public.photos p on p.id=sp.photo_id
        where sp.story_id=story_row.id and p.is_shared and p.lifecycle_status='active')));
    if story.id is null then raise exception 'NOT_FOUND'; end if;
    return to_jsonb(story)-'owner_id' || jsonb_build_object(
      'is_owner',story.owner_id=p_owner,
      'owner_name',(select display_name from public.profiles where user_id=story.owner_id),
      'photos',coalesce((select jsonb_agg(
        public.album_photo_json(p) || jsonb_build_object('position',sp.position)
        order by sp.position)
        from public.story_album_photos sp join public.photos p on p.id=sp.photo_id
        where sp.story_id=story.id and p.lifecycle_status='active'
          and (p.owner_id=p_owner or p.is_shared)),'[]'::jsonb));
  end if;

  if p_action='delete' then
    delete from public.story_albums where id=(p_data->>'story_id')::uuid
      and owner_id=p_owner returning * into story;
    if story.id is null then raise exception 'NOT_FOUND'; end if;
    return jsonb_build_object('deleted',story.id);
  end if;

  if p_action not in ('create','update') then raise exception 'BAD_REQUEST'; end if;
  insert into public.request_limits values(p_owner,date_trunc('minute',now()),1)
    on conflict(owner_id) do update set minute=excluded.minute,
      requests=case when request_limits.minute=excluded.minute then request_limits.requests+1 else 1 end
    returning requests into cnt;
  if cnt>180 then raise exception 'RATE_LIMIT'; end if;
  if char_length(btrim(coalesce(p_data->>'title',''))) not between 1 and 80
    or p_data->>'template' not in ('journal','cinema','postcard')
    or p_data->>'transition' not in ('slide','fade','zoom')
    or jsonb_typeof(p_data->'is_shared')<>'boolean'
    or jsonb_typeof(p_data->'photo_ids')<>'array'
    or jsonb_array_length(p_data->'photo_ids') not between 2 and 60 then
    raise exception 'BAD_REQUEST';
  end if;
  select array_agg(value::uuid order by ordinality) into photo_ids
    from jsonb_array_elements_text(p_data->'photo_ids') with ordinality;
  if array_length(photo_ids,1)<>(select count(distinct x) from unnest(photo_ids) x) then
    raise exception 'BAD_REQUEST';
  end if;
  requested_shared := (p_data->>'is_shared')::boolean;
  if exists(select 1 from unnest(photo_ids) requested(id)
    left join public.photos p on p.id=requested.id
    where p.id is null or p.lifecycle_status<>'active'
      or (p.owner_id<>p_owner and not p.is_shared)
      or (requested_shared and not p.is_shared)) then
    raise exception 'NOT_FOUND';
  end if;

  if p_action='create' then
    if (select count(*) from public.story_albums where owner_id=p_owner)>=50 then
      raise exception 'STORY_LIMIT';
    end if;
    insert into public.story_albums(owner_id,title,template,transition,is_shared)
      values(p_owner,btrim(p_data->>'title'),p_data->>'template',
        p_data->>'transition',requested_shared) returning * into story;
  else
    select * into story from public.story_albums
      where id=(p_data->>'story_id')::uuid and owner_id=p_owner for update;
    if story.id is null then raise exception 'NOT_FOUND'; end if;
    update public.story_albums set title=btrim(p_data->>'title'),
      template=p_data->>'template',transition=p_data->>'transition',
      is_shared=requested_shared,updated_at=now() where id=story.id;
    delete from public.story_album_photos where story_id=story.id;
  end if;
  insert into public.story_album_photos(story_id,photo_id,position)
    select story.id,photo_ids[i],i-1 from generate_subscripts(photo_ids,1) g(i);
  return public.album_v6_action(p_owner,'detail',jsonb_build_object('story_id',story.id));
end $$;
revoke all on function public.album_v6_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.album_v6_action(uuid,text,jsonb) to service_role;
commit;
