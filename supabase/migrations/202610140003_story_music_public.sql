begin;
create table public.story_music (
  story_id uuid primary key references public.story_albums(id) on delete cascade,
  provider text not null check(provider in ('netease','qq')),
  provider_track_id text not null check(provider_track_id ~ '^[1-9][0-9]{0,19}$'),
  enabled boolean not null default false,
  title text check(title is null or char_length(title)<=100),
  artist text check(artist is null or char_length(artist)<=100),
  schema_version smallint not null default 1 check(schema_version=1),
  source_url text generated always as (case provider when 'netease' then
    'https://music.163.com/song?id='||provider_track_id else
    'https://i.y.qq.com/v8/playsong.html?songid='||provider_track_id||'&songtype=0' end) stored,
  updated_at timestamptz not null default now()
);
create table public.story_share_links (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.story_albums(id) on delete cascade,
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index story_share_one_active on public.story_share_links(story_id) where revoked_at is null;
alter table public.story_music enable row level security;
alter table public.story_share_links enable row level security;
revoke all on public.story_music,public.story_share_links from public,anon,authenticated;
grant all on public.story_music,public.story_share_links to service_role;

create function public.album_v8_action(p_owner uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; cfg jsonb; music jsonb; story public.story_albums; colour text;
begin
  if not exists(select 1 from public.profiles where user_id=p_owner and is_active) then raise exception 'NOT_MEMBER'; end if;
  if p_action in ('share_create','share_revoke','share_status') then
    select * into story from public.story_albums where id=(p_data->>'story_id')::uuid and owner_id=p_owner for update;
    if story.id is null then raise exception 'NOT_FOUND'; end if;
    if p_action='share_status' then
      return jsonb_build_object('enabled',exists(select 1 from public.story_share_links where story_id=story.id and revoked_at is null));
    end if;
    if p_action='share_create' then
      if coalesce(p_data->>'token_hash','') !~ '^[0-9a-f]{64}$' then raise exception 'BAD_REQUEST'; end if;
      if exists(select 1 from public.story_album_photos sp join public.photos p on p.id=sp.photo_id
        where sp.story_id=story.id and (p.owner_id<>p_owner or p.lifecycle_status<>'active')) then raise exception 'PUBLIC_OWN_PHOTOS_ONLY'; end if;
      if not exists(select 1 from public.story_album_photos where story_id=story.id) then raise exception 'NOT_FOUND'; end if;
      update public.story_share_links set revoked_at=now() where story_id=story.id and revoked_at is null;
      insert into public.story_share_links(story_id,token_hash) values(story.id,p_data->>'token_hash');
      return jsonb_build_object('enabled',true);
    end if;
    update public.story_share_links set revoked_at=now() where story_id=story.id and revoked_at is null;
    return jsonb_build_object('enabled',false);
  end if;
  if p_action in ('create','update') then
    cfg := p_data->'zine_config'; colour := cfg->>'background_color';
    if colour is not null and colour !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'BAD_REQUEST'; end if;
    music := p_data->'music';
    if music is not null and music<>'null'::jsonb then
      if jsonb_typeof(music)<>'object' or coalesce(music->>'provider','') not in ('netease','qq')
        or coalesce(music->>'provider_track_id','') !~ '^[1-9][0-9]{0,19}$'
        or coalesce(jsonb_typeof(music->'enabled'),'')<>'boolean'
        or music->'schema_version' is distinct from '1'::jsonb
        or exists(select 1 from jsonb_object_keys(music) k where k not in ('provider','provider_track_id','enabled','title','artist','schema_version'))
        or (music->'title'<>'null'::jsonb and (jsonb_typeof(music->'title')<>'string' or char_length(music->>'title')>100))
        or (music->'artist'<>'null'::jsonb and (jsonb_typeof(music->'artist')<>'string' or char_length(music->>'artist')>100)) then raise exception 'BAD_REQUEST'; end if;
    end if;
    result := public.album_v7_action(p_owner,p_action,(p_data-'music')||jsonb_build_object('zine_config',cfg-'background_color'));
    if colour is not null then
      update public.story_albums set zine_config=jsonb_set(zine_config,'{background_color}',to_jsonb(upper(colour))) where id=(result->>'id')::uuid;
    end if;
    if p_data ? 'music' then
      if music='null'::jsonb then delete from public.story_music where story_id=(result->>'id')::uuid;
      else insert into public.story_music(story_id,provider,provider_track_id,enabled,title,artist)
        values((result->>'id')::uuid,music->>'provider',music->>'provider_track_id',(music->>'enabled')::boolean,nullif(btrim(music->>'title'),''),nullif(btrim(music->>'artist'),''))
        on conflict(story_id) do update set provider=excluded.provider,provider_track_id=excluded.provider_track_id,
          enabled=excluded.enabled,title=excluded.title,artist=excluded.artist,updated_at=now();
      end if;
    end if;
    update public.story_share_links set revoked_at=now() where story_id=(result->>'id')::uuid and revoked_at is null and exists(
      select 1 from public.story_album_photos sp join public.photos p on p.id=sp.photo_id where sp.story_id=(result->>'id')::uuid and p.owner_id<>p_owner);
    return public.album_v8_action(p_owner,'detail',jsonb_build_object('story_id',result->>'id'));
  end if;
  result := public.album_v7_action(p_owner,p_action,p_data);
  if p_action='detail' then
    select to_jsonb(m)-'story_id'-'updated_at' into music from public.story_music m where story_id=(result->>'id')::uuid and ((result->>'is_owner')::boolean or enabled);
    result := result||jsonb_build_object('music',music);
  end if;
  return result;
end $$;
revoke all on function public.album_v8_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.album_v8_action(uuid,text,jsonb) to service_role;

create function public.album_story_public(p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare story public.story_albums; result jsonb; photos jsonb; assets jsonb; cfg jsonb; safe_pages jsonb := '[]'; page jsonb; slots jsonb; visible_ids text[];
begin
  select s.* into story from public.story_share_links l join public.story_albums s on s.id=l.story_id
    join public.profiles profile on profile.user_id=s.owner_id and profile.is_active
    where l.token_hash=p_token_hash and l.revoked_at is null;
  if story.id is null or exists(select 1 from public.story_album_photos sp join public.photos p on p.id=sp.photo_id
    where sp.story_id=story.id and p.owner_id<>story.owner_id) then raise exception 'NOT_FOUND'; end if;
  select jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'captured_local',p.captured_local,'location_label',p.location_label,
    'assets',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'role',a.role,'width',a.width,'height',a.height,'mime_type',a.mime_type))
      from public.photo_assets a where a.photo_id=p.id and a.role in ('preview','thumbnail')),'[]'::jsonb)) order by sp.position)
    into photos from public.story_album_photos sp join public.photos p on p.id=sp.photo_id where sp.story_id=story.id and p.lifecycle_status='active';
  if photos is null then raise exception 'NOT_FOUND'; end if;
  select jsonb_agg(jsonb_build_object('id',a.id,'object_key',a.object_key)) into assets
    from public.story_album_photos sp join public.photos p on p.id=sp.photo_id and p.lifecycle_status='active'
    join public.photo_assets a on a.photo_id=p.id and a.role in ('preview','thumbnail') where sp.story_id=story.id;
  cfg := story.zine_config;
  if cfg is not null then
    select array_agg(value->>'id') into visible_ids from jsonb_array_elements(photos);
    for page in select value from jsonb_array_elements(cfg->'pages') loop
      select jsonb_agg(case when value=any(visible_ids) then to_jsonb(value) else 'null'::jsonb end order by ordinality)
        into slots from jsonb_array_elements_text(page->'photo_ids') with ordinality;
      safe_pages := safe_pages||jsonb_build_array(page||jsonb_build_object('photo_ids',slots));
    end loop;
    cfg := jsonb_set(cfg,'{pages}',safe_pages);
  end if;
  return jsonb_build_object('id',story.id,'title',story.title,'template',story.template,'transition',story.transition,
    'zine_config',cfg,'photos',photos,'is_owner',false,'preview_assets',coalesce(assets,'[]'::jsonb),
    'music',(select to_jsonb(m)-'story_id'-'updated_at' from public.story_music m where m.story_id=story.id and m.enabled));
end $$;
revoke all on function public.album_story_public(text) from public,anon,authenticated;
grant execute on function public.album_story_public(text) to service_role;
commit;
