-- Add opt-in family sharing without changing the visibility of existing photos.
alter table public.profiles add column avatar_data_url text
  check (avatar_data_url is null or
    (length(avatar_data_url) <= 90000 and
     avatar_data_url ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'));
alter table public.photos add column is_shared boolean not null default false;
create index photos_shared_page on public.photos(is_shared,sort_date desc,uploaded_at desc,id desc)
  where is_shared and lifecycle_status='active';

-- This RPC alone exposes shared records. Existing authenticated table policies
-- continue to restrict direct reads to each owner.
create function public.album_v2_action(p_owner uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.photos; r jsonb; cnt integer; profile_row public.profiles;
begin
 if not exists(select 1 from public.profiles where user_id=p_owner and is_active) then raise exception 'NOT_MEMBER'; end if;
 if p_action in ('profile','share','download','read') then
  insert into public.request_limits values(p_owner,date_trunc('minute',now()),1)
  on conflict(owner_id) do update set minute=excluded.minute,
    requests=case when request_limits.minute=excluded.minute then request_limits.requests+1 else 1 end
  returning requests into cnt;
  if cnt>180 then raise exception 'RATE_LIMIT'; end if;
 end if;
 if p_action='profile_read' then
  select * into profile_row from public.profiles where user_id=p_owner;
  return jsonb_build_object('display_name',profile_row.display_name,'avatar_data_url',profile_row.avatar_data_url);
 elsif p_action='profile' then
  if not (p_data ? 'display_name' or p_data ? 'avatar_data_url') then raise exception 'BAD_REQUEST'; end if;
  update public.profiles set
   display_name=case when p_data ? 'display_name' then p_data->>'display_name' else display_name end,
   avatar_data_url=case when p_data ? 'avatar_data_url' then p_data->>'avatar_data_url' else avatar_data_url end
  where user_id=p_owner returning * into profile_row;
  return jsonb_build_object('display_name',profile_row.display_name,'avatar_data_url',profile_row.avatar_data_url);
 elsif p_action='list_shared' then
  return jsonb_build_object('photos',coalesce((
   select jsonb_agg(public.album_photo_json(q) || jsonb_build_object(
    'is_owner',q.owner_id=p_owner,'owner_name',owner_profile.display_name)
    order by q.sort_date desc,q.uploaded_at desc,q.id desc)
   from (select * from public.photos where is_shared and lifecycle_status='active'
    and (p_data->'cursor' is null or
     (sort_date,uploaded_at,id)<((p_data#>>'{cursor,sort_date}')::date,
      (p_data#>>'{cursor,uploaded_at}')::timestamptz,(p_data#>>'{cursor,id}')::uuid))
    order by sort_date desc,uploaded_at desc,id desc
    limit least(coalesce((p_data->>'limit')::integer,24),48)) q
   join public.profiles owner_profile on owner_profile.user_id=q.owner_id
  ),'[]'::jsonb));
 elsif p_action in ('photo','download','share') then
  select * into p from public.photos where id=(p_data->>'photo_id')::uuid
   and (owner_id=p_owner or (is_shared and lifecycle_status='active' and p_action<>'share'))
   and lifecycle_status<>'deleting';
  if p.id is null then raise exception 'NOT_FOUND'; end if;
  if p_action='share' then
   if p.owner_id<>p_owner then raise exception 'NOT_FOUND'; end if;
   update public.photos set is_shared=(p_data->>'is_shared')::boolean,updated_at=now()
    where id=p.id returning * into p;
  elsif p_action='download' then
   select jsonb_build_object('object_key',object_key,'filename',original_filename,'mime',mime_type)
    into r from public.photo_assets where photo_id=p.id
    and role=coalesce(p_data->>'role','original_image');
   if r is null then raise exception 'NOT_FOUND'; end if;
   return r;
  end if;
  return public.album_photo_json(p) || jsonb_build_object(
   'is_owner',p.owner_id=p_owner,
   'owner_name',(select display_name from public.profiles where user_id=p.owner_id));
 elsif p_action='read' then
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'object_key',a.object_key)),'[]'::jsonb)
   into r from public.photo_assets a join public.photos photo_row on photo_row.id=a.photo_id
   where (photo_row.owner_id=p_owner and photo_row.lifecycle_status<>'deleting'
     or photo_row.is_shared and photo_row.lifecycle_status='active')
    and a.id in(select value::uuid from jsonb_array_elements_text(p_data->'ids'))
    and a.role in ('preview','thumbnail');
  if jsonb_array_length(r)<>jsonb_array_length(p_data->'ids') then raise exception 'NOT_FOUND'; end if;
  return r;
 end if;
 raise exception 'BAD_REQUEST';
end $$;
revoke all on function public.album_v2_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.album_v2_action(uuid,text,jsonb) to service_role;
