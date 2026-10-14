begin;
alter table public.story_music drop constraint story_music_provider_check;
alter table public.story_music drop constraint story_music_provider_track_id_check;
alter table public.story_music add constraint story_music_provider_check check(provider in ('netease','qq','file'));
alter table public.story_music add constraint story_music_provider_track_id_check check(
  (provider='file' and provider_track_id='whenever') or
  (provider in ('netease','qq') and provider_track_id ~ '^[1-9][0-9]{0,19}$'));
-- Recalculate the generated URL. Existing platform IDs and metadata are retained.
alter table public.story_music drop column source_url;
alter table public.story_music add column source_url text generated always as (
  case provider when 'file' then 'https://xuan9527zz.github.io/album/music/whenever.mp3'
    when 'netease' then 'https://music.163.com/song?id='||provider_track_id
    else 'https://i.y.qq.com/v8/playsong.html?songid='||provider_track_id||'&songtype=0' end) stored;

create function public.album_v10_action(p_owner uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg jsonb; music jsonb; seconds jsonb; delegated jsonb; result jsonb;
begin
  if not exists(select 1 from public.profiles where user_id=p_owner and is_active) then raise exception 'NOT_MEMBER'; end if;
  if p_action not in ('create','update') then return public.album_v8_action(p_owner,p_action,p_data); end if;
  cfg := p_data->'zine_config'; seconds := cfg->'slide_seconds'; music := p_data->'music';
  if seconds is not null then
    if jsonb_typeof(seconds)<>'number' or (seconds#>>'{}') !~ '^[0-9]+$' then raise exception 'BAD_REQUEST'; end if;
    if (seconds#>>'{}')::numeric not between 2 and 60 then raise exception 'BAD_REQUEST'; end if;
  end if;
  delegated := p_data||jsonb_build_object('zine_config',cfg-'slide_seconds');
  if music->>'provider'='file' then
    if jsonb_typeof(music)<>'object' or music->>'provider_track_id' is distinct from 'whenever'
      or music->'schema_version' is distinct from '1'::jsonb or jsonb_typeof(music->'enabled') is distinct from 'boolean'
      or not (music ?& array['provider','provider_track_id','enabled','title','artist','schema_version'])
      or exists(select 1 from jsonb_object_keys(music) k where k not in ('provider','provider_track_id','enabled','title','artist','schema_version'))
      or (music->'title'<>'null'::jsonb and (jsonb_typeof(music->'title')<>'string' or char_length(music->>'title')>100))
      or (music->'artist'<>'null'::jsonb and (jsonb_typeof(music->'artist')<>'string' or char_length(music->>'artist')>100)) then raise exception 'BAD_REQUEST'; end if;
    delegated := delegated||jsonb_build_object('music',null);
  end if;
  result := public.album_v8_action(p_owner,p_action,delegated);
  if seconds is not null then
    update public.story_albums set zine_config=jsonb_set(zine_config,'{slide_seconds}',seconds)
      where id=(result->>'id')::uuid and owner_id=p_owner;
  end if;
  if music->>'provider'='file' then
    insert into public.story_music(story_id,provider,provider_track_id,enabled,title,artist)
      values((result->>'id')::uuid,'file','whenever',(music->>'enabled')::boolean,
        nullif(btrim(music->>'title'),''),nullif(btrim(music->>'artist'),''));
  end if;
  return public.album_v8_action(p_owner,'detail',jsonb_build_object('story_id',result->>'id'));
end $$;
revoke all on function public.album_v10_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.album_v10_action(uuid,text,jsonb) to service_role;
commit;
