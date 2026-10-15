begin;
create table public.album_audio_files (
  id uuid primary key,
  owner_id uuid not null references public.profiles(user_id),
  title text not null check(char_length(title) between 1 and 100),
  size_bytes bigint not null check(size_bytes between 16 and 20971520),
  github_asset_id bigint unique check(github_asset_id>0),
  status text not null default 'uploading' check(status in ('uploading','active','deleting','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '15 minutes'),
  cleanup_after timestamptz,
  check(status<>'active' or github_asset_id is not null)
);
create index album_audio_expiration on public.album_audio_files(expires_at) where status<>'expired';
alter table public.album_audio_files enable row level security;
revoke all on public.album_audio_files from public,anon,authenticated;
grant all on public.album_audio_files to service_role;

create function public.album_music_action(p_owner uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.album_audio_files; rows jsonb;
begin
  if p_action='stream' then
    select * into item from public.album_audio_files where id=(p_data->>'id')::uuid;
    if item.id is null then raise exception 'NOT_FOUND'; end if;
    if item.status<>'active' or item.expires_at<=clock_timestamp() then raise exception 'MUSIC_EXPIRED'; end if;
    return jsonb_build_object('asset_id',item.github_asset_id,'expires_at',item.expires_at);
  end if;
  if p_action='cleanup_claim' then
    with due as (select id from public.album_audio_files where status<>'expired' and expires_at<=clock_timestamp()
      and (cleanup_after is null or cleanup_after<=clock_timestamp()) order by expires_at limit 10 for update skip locked),
    claimed as (update public.album_audio_files a set status='deleting',cleanup_after=now()+interval '5 minutes' from due where a.id=due.id returning a.id,a.github_asset_id)
    select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into rows from claimed;
    return rows;
  end if;
  if p_action='cleanup_done' then
    update public.album_audio_files set status='expired',github_asset_id=null,cleanup_after=null where id=(p_data->>'id')::uuid and status='deleting';
    return '{}';
  end if;
  if p_action='asset_ids' then
    return coalesce((select jsonb_agg(github_asset_id) from public.album_audio_files where github_asset_id is not null),'[]'::jsonb);
  end if;
  if not exists(select 1 from public.profiles where user_id=p_owner and is_active) then raise exception 'NOT_MEMBER'; end if;
  if p_action='list' then
    return jsonb_build_object('files',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'size_bytes',size_bytes,'expires_at',expires_at,
      'expired',status<>'active' or expires_at<=clock_timestamp()) order by created_at desc) from
      (select * from public.album_audio_files where owner_id=p_owner and status<>'uploading' order by created_at desc limit 32) a),'[]'::jsonb));
  end if;
  if p_action='reserve' then
    perform 1 from public.profiles where user_id=p_owner for update;
    if (select count(*) from public.album_audio_files where owner_id=p_owner and status in ('uploading','active') and expires_at>now())>=8 then raise exception 'MUSIC_LIMIT'; end if;
    insert into public.album_audio_files(id,owner_id,title,size_bytes) values((p_data->>'id')::uuid,p_owner,p_data->>'title',(p_data->>'size')::bigint) returning * into item;
    return jsonb_build_object('id',item.id);
  end if;
  if p_action='finish' then
    update public.album_audio_files set status='active',github_asset_id=(p_data->>'asset_id')::bigint,expires_at=clock_timestamp()+interval '72 hours'
      where id=(p_data->>'id')::uuid and owner_id=p_owner and status='uploading' and expires_at>clock_timestamp() returning * into item;
    if item.id is null then raise exception 'UPLOAD_EXPIRED'; end if;
    return jsonb_build_object('id',item.id,'title',item.title,'size_bytes',item.size_bytes,'expires_at',item.expires_at,'expired',false);
  end if;
  if p_action='abort' then
    update public.album_audio_files set status='deleting',expires_at=now(),cleanup_after=null,github_asset_id=coalesce((p_data->>'asset_id')::bigint,github_asset_id)
      where id=(p_data->>'id')::uuid and owner_id=p_owner and status='uploading';
    return '{}';
  end if;
  raise exception 'BAD_REQUEST';
end $$;
revoke all on function public.album_music_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.album_music_action(uuid,text,jsonb) to service_role;

alter table public.story_music drop constraint story_music_provider_track_id_check;
alter table public.story_music add constraint story_music_provider_track_id_check check(
  (provider='file' and (provider_track_id='whenever' or provider_track_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
  or (provider in ('netease','qq') and provider_track_id ~ '^[1-9][0-9]{0,19}$'));
alter table public.story_music drop column source_url;
alter table public.story_music add column source_url text generated always as (
  case when provider='file' and provider_track_id='whenever' then 'https://xuan9527zz.github.io/album/music/whenever.mp3'
    when provider='file' then 'https://nqjdngemhgmahqjuuxwx.supabase.co/functions/v1/album-gateway/v1/music/'||provider_track_id||'/stream'
    when provider='netease' then 'https://music.163.com/song?id='||provider_track_id
    else 'https://i.y.qq.com/v8/playsong.html?songid='||provider_track_id||'&songtype=0' end) stored;

create function public.album_music_info(p_music jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare audio public.album_audio_files;
begin
  if p_music->>'provider'='file' and p_music->>'provider_track_id'<>'whenever' then
    select * into audio from public.album_audio_files where id=(p_music->>'provider_track_id')::uuid;
    return p_music||jsonb_build_object('expires_at',audio.expires_at,'expired',audio.id is null or audio.status<>'active' or audio.expires_at<=clock_timestamp());
  end if;
  return p_music;
end $$;
revoke all on function public.album_music_info(jsonb) from public,anon,authenticated;
grant execute on function public.album_music_info(jsonb) to service_role;

create function public.album_v13_action(p_owner uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; music jsonb;
begin
  music := p_data->'music';
  if p_action in ('create','update') and music->>'provider'='file' and music->>'provider_track_id'<>'whenever' then
    if jsonb_typeof(music)<>'object' or coalesce(music->>'provider_track_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or music->'schema_version' is distinct from '1'::jsonb or jsonb_typeof(music->'enabled') is distinct from 'boolean'
      or not(music ?& array['provider','provider_track_id','enabled','title','artist','schema_version'])
      or exists(select 1 from jsonb_object_keys(music) k where k not in ('provider','provider_track_id','enabled','title','artist','schema_version'))
      or (music->'title'<>'null'::jsonb and (jsonb_typeof(music->'title')<>'string' or char_length(music->>'title')>100))
      or (music->'artist'<>'null'::jsonb and (jsonb_typeof(music->'artist')<>'string' or char_length(music->>'artist')>100)) then raise exception 'BAD_REQUEST'; end if;
    if not exists(select 1 from public.album_audio_files where id=(music->>'provider_track_id')::uuid and owner_id=p_owner and (not (music->>'enabled')::boolean or (status='active' and expires_at>clock_timestamp()))) then raise exception 'MUSIC_EXPIRED'; end if;
    result := public.album_v11_action(p_owner,p_action,p_data||jsonb_build_object('music',null));
    insert into public.story_music(story_id,provider,provider_track_id,enabled,title,artist) values((result->>'id')::uuid,'file',music->>'provider_track_id',(music->>'enabled')::boolean,
      nullif(btrim(music->>'title'),''),nullif(btrim(music->>'artist'),''));
    return public.album_v13_action(p_owner,'detail',jsonb_build_object('story_id',result->>'id'));
  end if;
  result := public.album_v11_action(p_owner,p_action,p_data);
  if result ? 'music' then result := jsonb_set(result,'{music}',coalesce(public.album_music_info(result->'music'),'null'::jsonb)); end if;
  return result;
end $$;
revoke all on function public.album_v13_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.album_v13_action(uuid,text,jsonb) to service_role;
alter function public.album_story_public(text) rename to album_story_public_v12;
create function public.album_story_public(p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  result := public.album_story_public_v12(p_token_hash);
  return jsonb_set(result,'{music}',coalesce(public.album_music_info(result->'music'),'null'::jsonb));
end $$;
revoke all on function public.album_story_public(text) from public,anon,authenticated;
grant execute on function public.album_story_public(text) to service_role;
commit;
