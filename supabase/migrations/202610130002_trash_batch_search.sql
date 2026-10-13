-- A private, recoverable 30-day trash. Existing photos remain untouched.
begin;
alter table public.photos drop constraint if exists photos_lifecycle_status_check;
alter table public.photos add constraint photos_lifecycle_status_check
  check (lifecycle_status in ('uploading','active','failed','trashed','deleting'));
alter table public.photos add column deleted_at timestamptz;
alter table public.photos add constraint photos_trashed_has_time
  check (lifecycle_status<>'trashed' or deleted_at is not null);
create index photos_trash_page on public.photos(owner_id,deleted_at desc,id desc)
  where lifecycle_status='trashed';

drop policy photo_read on public.photos;
create policy photo_read on public.photos for select to authenticated
  using(owner_id=auth.uid() and public.is_album_member()
    and lifecycle_status not in ('trashed','deleting'));
drop policy asset_read on public.photo_assets;
create policy asset_read on public.photo_assets for select to authenticated
  using(owner_id=auth.uid() and public.is_album_member() and exists(
    select 1 from public.photos where id=photo_id
      and lifecycle_status not in ('trashed','deleting')));

-- Legacy upload-session cleanup must never make a trashed photo visible again.
create function public.album_preserve_trash() returns trigger language plpgsql set search_path='' as $$
begin
 if old.lifecycle_status='trashed' and old.deleted_at is not null
    and new.deleted_at is not null and new.lifecycle_status<>'deleting' then
  new.lifecycle_status='trashed';
 end if;
 return new;
end $$;
create trigger preserve_trash before update on public.photos for each row
  execute function public.album_preserve_trash();
revoke all on function public.album_preserve_trash() from public,anon,authenticated;

create function public.album_v3_action(p_owner uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.photos; r jsonb; cnt integer; target_id uuid; selected uuid[] := '{}'; item text;
begin
 if not exists(select 1 from public.profiles where user_id=p_owner and is_active) then
  raise exception 'NOT_MEMBER';
 end if;
 if p_action in ('trash','restore','purge','batch','read','read_trashed') then
  insert into public.request_limits values(p_owner,date_trunc('minute',now()),1)
  on conflict(owner_id) do update set minute=excluded.minute,
   requests=case when request_limits.minute=excluded.minute then request_limits.requests+1 else 1 end
  returning requests into cnt;
  if cnt>180 then raise exception 'RATE_LIMIT'; end if;
 end if;
 if p_action='summary' then
  r=public.album_action(p_owner,'me','{}');
  return jsonb_set(r,'{photo_count}',to_jsonb((select count(*) from public.photos
   where owner_id=p_owner and lifecycle_status not in ('trashed','deleting'))));
 elsif p_action='members' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',user_id,'name',display_name)
   order by display_name) from public.profiles where is_active),'[]'::jsonb);
 elsif p_action='list' then
  return jsonb_build_object('photos',coalesce((
   select jsonb_agg(public.album_photo_json(q) || jsonb_build_object(
    'is_owner',q.owner_id=p_owner,'owner_name',owner_profile.display_name)
    order by q.sort_date desc,q.uploaded_at desc,q.id desc)
   from (select * from public.photos where
     (case when coalesce((p_data->>'shared')::boolean,false)
      then is_shared and lifecycle_status='active'
      else owner_id=p_owner and lifecycle_status not in ('trashed','deleting')
       and (not coalesce((p_data->>'featured')::boolean,false) or is_featured) end)
     and (p_data->>'year' is null or extract(year from sort_date)=(p_data->>'year')::integer)
     and (p_data->>'month' is null or extract(month from sort_date)=(p_data->>'month')::integer)
     and (p_data->>'place' is null or position(lower(p_data->>'place') in lower(coalesce(location_label,'')))>0)
     and (p_data->>'owner' is null or owner_id=(p_data->>'owner')::uuid)
     and (p_data->'cursor' is null or
      (sort_date,uploaded_at,id)<((p_data#>>'{cursor,sort_date}')::date,
       (p_data#>>'{cursor,uploaded_at}')::timestamptz,(p_data#>>'{cursor,id}')::uuid))
    order by sort_date desc,uploaded_at desc,id desc
    limit least(coalesce((p_data->>'limit')::integer,24),48)) q
   join public.profiles owner_profile on owner_profile.user_id=q.owner_id
  ),'[]'::jsonb));
 elsif p_action='trash_list' then
  return jsonb_build_object('photos',coalesce((select jsonb_agg(public.album_photo_json(q)
   order by q.deleted_at desc,q.id desc) from
   (select * from public.photos where owner_id=p_owner and lifecycle_status='trashed'
    and (p_data->'cursor' is null or (deleted_at,id)<
      ((p_data#>>'{cursor,deleted_at}')::timestamptz,(p_data#>>'{cursor,id}')::uuid))
    order by deleted_at desc,id desc limit least(coalesce((p_data->>'limit')::integer,24),48)) q
   ),'[]'::jsonb));
 elsif p_action in ('photo','download','share','edit','supplement') then
  select * into p from public.photos where id=(p_data->>'photo_id')::uuid;
  if p.id is null or p.lifecycle_status in ('trashed','deleting') then raise exception 'NOT_FOUND'; end if;
  if p_action in ('edit','supplement') then
   if p.owner_id<>p_owner then raise exception 'NOT_FOUND'; end if;
   return public.album_action(p_owner,p_action,p_data);
  end if;
  return public.album_v2_action(p_owner,p_action,p_data);
 elsif p_action in ('read','read_trashed') then
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'object_key',a.object_key)),'[]'::jsonb)
   into r from public.photo_assets a join public.photos photo_row on photo_row.id=a.photo_id
   where a.id in(select value::uuid from jsonb_array_elements_text(p_data->'ids'))
    and a.role in ('preview','thumbnail') and
    (case when p_action='read_trashed' then
      photo_row.owner_id=p_owner and photo_row.lifecycle_status='trashed'
     else photo_row.owner_id=p_owner and photo_row.lifecycle_status not in ('trashed','deleting')
      or photo_row.is_shared and photo_row.lifecycle_status='active' end);
  if jsonb_array_length(r)<>jsonb_array_length(p_data->'ids') then raise exception 'NOT_FOUND'; end if;
  return r;
 elsif p_action in ('trash','restore','purge') then
  select * into p from public.photos where id=(p_data->>'photo_id')::uuid and owner_id=p_owner for update;
  if p.id is null then raise exception 'NOT_FOUND'; end if;
  if p_action='trash' then
   if p.lifecycle_status in ('trashed','deleting') then raise exception 'NOT_FOUND'; end if;
   update public.photos set lifecycle_status='trashed',deleted_at=now(),updated_at=now() where id=p.id;
   update public.upload_sessions set state='cancelled' where photo_id=p.id and state<>'cleaned';
   return jsonb_build_object('status','trashed');
  elsif p_action='restore' then
   if p.lifecycle_status<>'trashed' or p.deleted_at<=now()-interval '30 days' then raise exception 'NOT_FOUND'; end if;
   update public.photos set lifecycle_status=case when original_status='saved' then 'active' else 'failed' end,
    deleted_at=null,updated_at=now() where id=p.id;
   return public.album_photo_json((select q from public.photos q where q.id=p.id));
  else
   if p.lifecycle_status<>'trashed' then raise exception 'NOT_FOUND'; end if;
   update public.photos set lifecycle_status='deleting',updated_at=now() where id=p.id;
   return jsonb_build_object('status','deleting');
  end if;
 elsif p_action='batch' then
  if p_data->>'operation' not in ('feature_on','feature_off','share_on','share_off','trash')
    or jsonb_typeof(p_data->'ids')<>'array'
    or jsonb_array_length(p_data->'ids') not between 1 and 50 then raise exception 'BAD_REQUEST'; end if;
  for item in select value from jsonb_array_elements_text(p_data->'ids') loop
   target_id=item::uuid;
   if target_id=any(selected) then raise exception 'BAD_REQUEST'; end if;
   select * into p from public.photos where id=target_id and owner_id=p_owner for update;
   if p.id is null or p.lifecycle_status in ('trashed','deleting')
      or (p_data->>'operation'='share_on' and p.lifecycle_status<>'active') then
    raise exception 'NOT_FOUND';
   end if;
   selected=array_append(selected,target_id);
  end loop;
  if p_data->>'operation' in ('feature_on','feature_off') then
   update public.photos set is_featured=(p_data->>'operation'='feature_on'),updated_at=now()
    where id=any(selected);
  elsif p_data->>'operation' in ('share_on','share_off') then
   update public.photos set is_shared=(p_data->>'operation'='share_on'),updated_at=now()
    where id=any(selected);
  else
   update public.photos set lifecycle_status='trashed',deleted_at=now(),updated_at=now()
    where id=any(selected);
   update public.upload_sessions set state='cancelled'
    where photo_id=any(selected) and state<>'cleaned';
  end if;
  return jsonb_build_object('updated',array_length(selected,1));
 end if;
 raise exception 'BAD_REQUEST';
end $$;

-- The existing six-hour maintenance then deletes only known R2 keys and releases quota.
create function public.album_v3_maintenance(p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if p_action='due' then
  return jsonb_build_object('expired_due',(select count(*) from public.photos
   where lifecycle_status='trashed' and deleted_at<=now()-interval '30 days'));
 end if;
 if p_action<>'expire' then raise exception 'BAD_REQUEST'; end if;
 with due as (select id from public.photos where lifecycle_status='trashed'
    and deleted_at<=now()-interval '30 days' order by deleted_at limit 50 for update),
 changed as (update public.photos set lifecycle_status='deleting',updated_at=now()
    where id in (select id from due) returning id)
 select count(*) into n from changed;
 return jsonb_build_object('expired',n);
end $$;
revoke all on function public.album_v3_action(uuid,text,jsonb),
 public.album_v3_maintenance(text,jsonb) from public,anon,authenticated;
grant execute on function public.album_v3_action(uuid,text,jsonb),
 public.album_v3_maintenance(text,jsonb) to service_role;
commit;
