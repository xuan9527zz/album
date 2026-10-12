-- Apply once to an independent Supabase project. All writes are service-only RPCs.
create table public.profiles (
 user_id uuid primary key references auth.users(id), display_name text not null check(length(display_name) between 1 and 40),
 is_active boolean not null default false, created_at timestamptz not null default now()
);
create function public.limit_members() returns trigger language plpgsql set search_path = '' as $$
begin
 perform pg_advisory_xact_lock(74112026);
 if new.is_active and (select count(*) from public.profiles where is_active and user_id <> new.user_id) >= 4 then raise exception 'MEMBER_LIMIT'; end if;
 return new;
end $$;
create trigger four_members before insert or update on public.profiles for each row execute function public.limit_members();
create function public.is_album_member() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where user_id = auth.uid() and is_active);
$$;
revoke all on function public.is_album_member() from public, anon;
grant execute on function public.is_album_member() to authenticated;

create table public.photos (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(user_id),
 captured_local timestamp, captured_utc timestamptz, capture_offset_minutes smallint check(capture_offset_minutes between -840 and 840),
 date_source text not null default 'unknown' check(date_source in ('unknown','exif','manual')),
 sort_date date not null default (now() at time zone 'Asia/Tokyo')::date,
 location_label text check(length(location_label)<=120), latitude double precision check(latitude between -90 and 90), longitude double precision check(longitude between -180 and 180),
 location_source text not null default 'unknown' check(location_source in ('unknown','exif','manual')),
 source_metadata jsonb not null default '{}', is_featured boolean not null default false,
 preview_status text not null default 'pending' check(preview_status in ('pending','ready','failed')),
 original_status text not null default 'pending' check(original_status in ('pending','saved','failed')),
 live_status text not null default 'unknown' check(live_status in ('unknown','static_only','paired_unverified','paired_verified')),
 lifecycle_status text not null default 'uploading' check(lifecycle_status in ('uploading','active','failed','deleting')),
 uploaded_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,owner_id), check((latitude is null) = (longitude is null))
);
create index photos_page on public.photos(owner_id,sort_date desc,uploaded_at desc,id desc);
create index photos_featured_page on public.photos(owner_id,is_featured,sort_date desc,uploaded_at desc,id desc);
create index photos_lifecycle on public.photos(owner_id,lifecycle_status);
create table public.photo_assets (
 id uuid primary key, photo_id uuid not null, owner_id uuid not null,
 role text not null check(role in ('original_image','live_video','preview','thumbnail')),
 object_key text not null unique, original_filename text not null check(length(original_filename) between 1 and 240),
 mime_type text not null, size_bytes bigint not null check(size_bytes>0), width integer check(width>0), height integer check(height>0),
 checksum_algorithm text not null default 'SHA256', checksum_value text not null, md5 text not null,
 checksum_verification text not null default 'transport_verified' check(checksum_verification in ('client_reported','transport_verified','download_verified')),
 source_original_verified boolean not null default false, etag text not null,
 provenance text not null check(provenance in ('browser_selected','file_imported')), pairing_method text,
 created_at timestamptz not null default now(), unique(photo_id,role), foreign key(photo_id,owner_id) references public.photos(id,owner_id)
);
create table public.upload_sessions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, photo_id uuid not null,
 idempotency_key text not null check(length(idempotency_key) between 8 and 160), request_digest text not null,
 state text not null default 'open' check(state in ('open','completed','cancelled','cleaned')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '24 hours',
 unique(owner_id,idempotency_key), foreign key(photo_id,owner_id) references public.photos(id,owner_id)
);
create table public.upload_items (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.upload_sessions(id),
 owner_id uuid not null, photo_id uuid not null, role text not null check(role in ('original_image','live_video','preview','thumbnail')),
 object_key text not null unique, original_filename text not null check(length(original_filename) between 1 and 240),
 mime_type text not null, size_bytes bigint not null check(size_bytes>0), md5 text not null, sha256 text not null,
 provenance text not null check(provenance in ('browser_selected','file_imported')), width integer, height integer,
 state text not null default 'pending' check(state in ('pending','committed','released','obsolete')), signed_until timestamptz not null default now(),
 unique(session_id,role), foreign key(photo_id,owner_id) references public.photos(id,owner_id)
);
create index session_expiry on public.upload_sessions(expires_at);
create table public.storage_budget (
 id integer primary key check(id=1), committed_bytes bigint not null default 0 check(committed_bytes>=0),
 reserved_bytes bigint not null default 0 check(reserved_bytes>=0), budget_bytes bigint not null check(budget_bytes>0),
 warning_bytes bigint not null check(warning_bytes>0 and warning_bytes<=budget_bytes), last_reconciled_at timestamptz
);
insert into public.storage_budget(id,budget_bytes,warning_bytes) values(1,8000000000,6000000000);
create table public.request_limits(owner_id uuid primary key, minute timestamptz not null, requests integer not null);
alter table public.profiles enable row level security;
alter table public.photos enable row level security;
alter table public.photo_assets enable row level security;
alter table public.upload_sessions enable row level security;
alter table public.upload_items enable row level security;
alter table public.storage_budget enable row level security;
alter table public.request_limits enable row level security;
create policy profile_read on public.profiles for select to authenticated using(user_id=auth.uid() and public.is_album_member());
create policy photo_read on public.photos for select to authenticated using(owner_id=auth.uid() and public.is_album_member() and lifecycle_status<>'deleting');
create policy asset_read on public.photo_assets for select to authenticated using(owner_id=auth.uid() and public.is_album_member() and exists(select 1 from public.photos where id=photo_id and lifecycle_status<>'deleting'));
revoke all on public.profiles,public.photos,public.photo_assets,public.upload_sessions,public.upload_items,public.storage_budget,public.request_limits from public,anon,authenticated;
grant select on public.profiles,public.photos,public.photo_assets to authenticated;
grant all on public.profiles,public.photos,public.photo_assets,public.upload_sessions,public.upload_items,public.storage_budget,public.request_limits to service_role;

create function public.album_photo_json(p public.photos) returns jsonb language sql stable set search_path='' as $$
 select to_jsonb(p)-'owner_id'-'source_metadata' || jsonb_build_object('assets',coalesce((select jsonb_agg(to_jsonb(a)-'owner_id'-'object_key'-'md5'-'etag'-'pairing_method') from public.photo_assets a where a.photo_id=p.id),'[]'::jsonb));
$$;
create function public.album_session_json(s public.upload_sessions) returns jsonb language sql stable set search_path='' as $$
 select to_jsonb(s)-'owner_id'-'idempotency_key'-'request_digest' || jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i)-'owner_id'-'object_key') from public.upload_items i where i.session_id=s.id),'[]'::jsonb));
$$;

create function public.album_action(p_owner uuid,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare
 p public.photos; s public.upload_sessions; i public.upload_items; a jsonb; m jsonb; r jsonb; b public.storage_budget;
 total bigint; sid uuid; pid uuid; iid uuid; cnt integer; until_at timestamptz;
begin
 if not exists(select 1 from public.profiles where user_id=p_owner and is_active) then raise exception 'NOT_MEMBER'; end if;
 -- Count mutations and signed-link requests. Gallery and status reads remain usable.
 if p_action in ('init','supplement','grants','complete','cancel','edit','delete','download','read') then
  insert into public.request_limits values(p_owner,date_trunc('minute',now()),1)
  on conflict(owner_id) do update set minute=excluded.minute,requests=case when request_limits.minute=excluded.minute then request_limits.requests+1 else 1 end returning requests into cnt;
  if cnt>180 then raise exception 'RATE_LIMIT'; end if;
 end if;
 if p_action in ('me','usage') then
  select * into b from public.storage_budget where id=1;
  select jsonb_build_object('display_name',display_name,'photo_count',(select count(*) from public.photos where owner_id=p_owner and lifecycle_status<>'deleting'),'personal_bytes',(select coalesce(sum(size_bytes),0) from public.photo_assets where owner_id=p_owner),'committed_bytes',b.committed_bytes,'reserved_bytes',b.reserved_bytes,'budget_bytes',b.budget_bytes,'warning_bytes',b.warning_bytes) into r from public.profiles where user_id=p_owner;
  return r;
 elsif p_action='list' then
  return jsonb_build_object('photos',coalesce((select jsonb_agg(public.album_photo_json(q) order by q.sort_date desc,q.uploaded_at desc,q.id desc) from (select * from public.photos where owner_id=p_owner and lifecycle_status<>'deleting' and (not coalesce((p_data->>'featured')::boolean,false) or is_featured) and (p_data->'cursor' is null or (sort_date,uploaded_at,id)<((p_data#>>'{cursor,sort_date}')::date,(p_data#>>'{cursor,uploaded_at}')::timestamptz,(p_data#>>'{cursor,id}')::uuid)) order by sort_date desc,uploaded_at desc,id desc limit least(coalesce((p_data->>'limit')::integer,24),48)) q),'[]'::jsonb));
 elsif p_action in ('photo','edit','delete','download','supplement') then
  select * into p from public.photos where id=(p_data->>'photo_id')::uuid and owner_id=p_owner for update;
  if p.id is null or (p.lifecycle_status='deleting' and p_action<>'delete') then raise exception 'NOT_FOUND'; end if;
  if p_action='photo' then return public.album_photo_json(p); end if;
  if p_action='edit' then
   m=p_data->'metadata';
   update public.photos set
    captured_local=case when m?'captured_local' then (m->>'captured_local')::timestamp else captured_local end,
    capture_offset_minutes=case when m?'capture_offset_minutes' or m?'captured_local' then (m->>'capture_offset_minutes')::smallint else capture_offset_minutes end,
    date_source=case when m?'captured_local' then case when m->>'captured_local' is null then 'unknown' else 'manual' end else date_source end,
    location_label=case when m?'location_label' then m->>'location_label' else location_label end,
    location_source=case when m?'location_label' then 'manual' else location_source end,
    latitude=case when m?'latitude' then (m->>'latitude')::double precision else latitude end,
    longitude=case when m?'longitude' then (m->>'longitude')::double precision else longitude end,
    is_featured=case when m?'is_featured' then (m->>'is_featured')::boolean else is_featured end,updated_at=now()
   where id=p.id;
   update public.photos set captured_utc=case when captured_local is not null and capture_offset_minutes is not null then (captured_local-make_interval(mins=>capture_offset_minutes)) at time zone 'UTC' else null end,sort_date=coalesce(captured_local::date,(uploaded_at at time zone 'Asia/Tokyo')::date) where id=p.id returning * into p;
   return public.album_photo_json(p);
  elsif p_action='delete' then
   update public.photos set lifecycle_status='deleting',updated_at=now() where id=p.id;
   update public.upload_sessions set state='cancelled' where photo_id=p.id and state<>'cleaned';
   return jsonb_build_object('status','deleting','cleanup_after',coalesce((select max(signed_until)+interval '60 seconds' from public.upload_items where photo_id=p.id),now()));
  elsif p_action='download' then
   select jsonb_build_object('object_key',object_key,'filename',original_filename,'mime',mime_type) into r from public.photo_assets where photo_id=p.id and owner_id=p_owner and role=coalesce(p_data->>'role','original_image');
   if r is null then raise exception 'NOT_FOUND'; end if; return r;
  end if;
 end if;
 if p_action in ('init','supplement') then
  -- Serializes budget + idempotency checks for every account.
  select * into b from public.storage_budget where id=1 for update;
  select * into s from public.upload_sessions where owner_id=p_owner and idempotency_key=p_data->>'key';
  if s.id is not null then
   if s.request_digest<>p_data->>'digest' then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return public.album_session_json(s);
  end if;
  select sum((v->>'size')::bigint) into total from jsonb_array_elements(p_data->'assets') v;
  if total is null or total<=0 then raise exception 'BAD_REQUEST'; end if;
  if b.committed_bytes+b.reserved_bytes+total>b.budget_bytes then raise exception 'BUDGET_EXCEEDED'; end if;
  if (select count(*) from public.upload_sessions where owner_id=p_owner and state='open' and expires_at>now())>=12 then raise exception 'TOO_MANY_UPLOADS'; end if;
  m=p_data->'metadata';
  if p_action='init' then
   if not exists(select 1 from jsonb_array_elements(p_data->'assets') v where v->>'role'='original_image') then raise exception 'ORIGINAL_REQUIRED'; end if;
   insert into public.photos(owner_id,captured_local,capture_offset_minutes,date_source,location_label,latitude,longitude,location_source,is_featured,source_metadata)
   values(p_owner,(m->>'captured_local')::timestamp,(m->>'capture_offset_minutes')::smallint,coalesce(m->>'date_source','unknown'),m->>'location_label',(m->>'latitude')::double precision,(m->>'longitude')::double precision,coalesce(m->>'location_source','unknown'),coalesce((m->>'is_featured')::boolean,false),m) returning * into p;
   update public.photos set captured_utc=case when captured_local is not null and capture_offset_minutes is not null then (captured_local-make_interval(mins=>capture_offset_minutes)) at time zone 'UTC' else null end,sort_date=coalesce(captured_local::date,sort_date) where id=p.id;
  end if;
  insert into public.upload_sessions(owner_id,photo_id,idempotency_key,request_digest) values(p_owner,p.id,p_data->>'key',p_data->>'digest') returning * into s;
  for a in select * from jsonb_array_elements(p_data->'assets') loop
   if p_action='supplement' and a->>'role'='original_image' then raise exception 'IMMUTABLE_ORIGINAL'; end if;
   if (a->>'role' not in ('preview','thumbnail') and exists(select 1 from public.photo_assets where photo_id=p.id and role=a->>'role')) or exists(select 1 from public.upload_items j where j.photo_id=p.id and j.role=a->>'role' and j.state='pending') then raise exception 'ROLE_EXISTS'; end if;
   iid=gen_random_uuid();
   insert into public.upload_items(id,session_id,owner_id,photo_id,role,object_key,original_filename,mime_type,size_bytes,md5,sha256,provenance,width,height)
   values(iid,s.id,p_owner,p.id,a->>'role','private/'||p_owner||'/'||p.id||'/'||iid,a->>'filename',a->>'mime',(a->>'size')::bigint,a->>'md5',a->>'sha256',a->>'provenance',(a->>'width')::integer,(a->>'height')::integer);
  end loop;
  update public.storage_budget set reserved_bytes=reserved_bytes+total where id=1;
  return public.album_session_json(s);
 elsif p_action in ('session','grants','complete','cancel') then
  select photo_id into pid from public.upload_sessions where id=(p_data->>'session_id')::uuid and owner_id=p_owner;
  select * into p from public.photos where id=pid for update;
  select * into s from public.upload_sessions where id=(p_data->>'session_id')::uuid and owner_id=p_owner for update;
  if s.id is null or p.lifecycle_status='deleting' then raise exception 'NOT_FOUND'; end if;
  if p_action='session' then return public.album_session_json(s); end if;
  if p_action='cancel' then
   update public.upload_sessions set state='cancelled' where id=s.id returning * into s;
   update public.photos set lifecycle_status=case when original_status='saved' then 'active' else 'failed' end,preview_status=case when preview_status='ready' then 'ready' else 'failed' end where id=p.id;
   return public.album_session_json(s);
  end if;
  if p_action='complete' then
   select * into i from public.upload_items where session_id=s.id and id=(p_data->>'item_id')::uuid;
   if i.id is null then raise exception 'NOT_FOUND'; end if;
   if i.state='committed' then return public.album_photo_json(p); end if;
  end if;
  if s.state<>'open' or s.expires_at<now() then raise exception 'UPLOAD_EXPIRED'; end if;
  if p_action='grants' then
   until_at=now()+make_interval(secs=>least((p_data->>'ttl')::int,900));
   update public.upload_items set signed_until=greatest(signed_until,until_at) where session_id=s.id and state='pending';
   select coalesce(jsonb_agg(to_jsonb(j)),'[]'::jsonb) into r from public.upload_items j where session_id=s.id and state='pending';
   return r;
  end if;
  if i.state<>'pending' then raise exception 'UPLOAD_EXPIRED'; end if;
  -- Old derived objects remain charged until their known keys are actually removed.
  if i.role in ('preview','thumbnail') then
   update public.upload_items set state='obsolete' where id in(select id from public.photo_assets where photo_id=p.id and role=i.role);
   update public.upload_sessions set state='completed' where id in(select session_id from public.upload_items where photo_id=p.id and state='obsolete') and state='cleaned';
   delete from public.photo_assets where photo_id=p.id and role=i.role;
  end if;
  insert into public.photo_assets(id,photo_id,owner_id,role,object_key,original_filename,mime_type,size_bytes,width,height,checksum_value,md5,etag,provenance,pairing_method)
  values(i.id,p.id,p_owner,i.role,i.object_key,i.original_filename,i.mime_type,i.size_bytes,i.width,i.height,i.sha256,i.md5,p_data->>'etag',i.provenance,case when i.role='live_video' then 'manual' else null end);
  update public.upload_items set state='committed' where id=i.id;
  update public.storage_budget set reserved_bytes=reserved_bytes-i.size_bytes,committed_bytes=committed_bytes+i.size_bytes where id=1;
  update public.photos set original_status=case when i.role='original_image' then 'saved' else original_status end,preview_status=case when i.role='preview' then 'ready' else preview_status end,
   live_status=case when i.role='live_video' then 'paired_unverified' when i.role='original_image' and live_status='unknown' then 'static_only' else live_status end,
   lifecycle_status=case when i.role='original_image' or original_status='saved' then 'active' else lifecycle_status end,updated_at=now() where id=p.id returning * into p;
  if not exists(select 1 from public.upload_items where session_id=s.id and state='pending') then update public.upload_sessions set state='completed' where id=s.id; end if;
  return public.album_photo_json(p);
 elsif p_action='read' then
  select coalesce(jsonb_agg(jsonb_build_object('id',asset_row.id,'object_key',asset_row.object_key)),'[]'::jsonb) into r from public.photo_assets asset_row join public.photos photo_row on photo_row.id=asset_row.photo_id where asset_row.owner_id=p_owner and photo_row.lifecycle_status<>'deleting' and asset_row.id in(select value::uuid from jsonb_array_elements_text(p_data->'ids')) and asset_row.role in ('preview','thumbnail');
  if jsonb_array_length(r)<>jsonb_array_length(p_data->'ids') then raise exception 'NOT_FOUND'; end if; return r;
 end if;
 raise exception 'BAD_REQUEST';
end $$;

-- Maintenance only touches known database keys, after every issued PUT has expired.
create function public.album_maintenance(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.photos; s public.upload_sessions; n bigint; r jsonb;
begin
 if p_action='plan' then
  return jsonb_build_object('deletions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'keys',(select coalesce(jsonb_agg(object_key),'[]'::jsonb) from public.upload_items where photo_id=q.id))) from (select id from public.photos where lifecycle_status='deleting' and not exists(select 1 from public.upload_items where photo_id=photos.id and signed_until+interval '60 seconds'>now()) limit 50) q),'[]'::jsonb),
   'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'keys',(select coalesce(jsonb_agg(object_key),'[]'::jsonb) from public.upload_items where session_id=q.id and state in ('pending','obsolete')))) from (select id from public.upload_sessions where state<>'cleaned' and (expires_at<now() or state in ('completed','cancelled')) and not exists(select 1 from public.upload_items where session_id=upload_sessions.id and signed_until+interval '60 seconds'>now()) and exists(select 1 from public.photos where id=photo_id and lifecycle_status<>'deleting') limit 50) q),'[]'::jsonb));
 elsif p_action='photo_done' then
  select * into p from public.photos where id=(p_data->>'id')::uuid for update;
  if p.id is null then return '{}'; end if;
  if p.lifecycle_status<>'deleting' or exists(select 1 from public.upload_items where photo_id=p.id and signed_until+interval '60 seconds'>now()) then raise exception 'CLEANUP_TOO_EARLY'; end if;
  update public.storage_budget set committed_bytes=committed_bytes-(select coalesce(sum(size_bytes),0) from public.photo_assets where photo_id=p.id)-(select coalesce(sum(size_bytes),0) from public.upload_items where photo_id=p.id and state='obsolete'),reserved_bytes=reserved_bytes-(select coalesce(sum(size_bytes),0) from public.upload_items where photo_id=p.id and state='pending') where id=1;
  delete from public.photo_assets where photo_id=p.id; delete from public.upload_items where photo_id=p.id; delete from public.upload_sessions where photo_id=p.id; delete from public.photos where id=p.id; return '{}';
 elsif p_action='session_done' then
  select * into s from public.upload_sessions where id=(p_data->>'id')::uuid;
  select * into p from public.photos where id=s.photo_id for update;
  select * into s from public.upload_sessions where id=s.id for update;
  if s.id is null or s.state='cleaned' then return '{}'; end if;
  if (s.state='open' and s.expires_at>now()) or exists(select 1 from public.upload_items where session_id=s.id and signed_until+interval '60 seconds'>now()) then raise exception 'CLEANUP_TOO_EARLY'; end if;
  select coalesce(sum(size_bytes),0) into n from public.upload_items where session_id=s.id and state='pending';
  update public.storage_budget set reserved_bytes=reserved_bytes-n,committed_bytes=committed_bytes-(select coalesce(sum(size_bytes),0) from public.upload_items where session_id=s.id and state='obsolete') where id=1;
  update public.upload_items set state='released' where session_id=s.id and state in ('pending','obsolete');
  update public.upload_sessions set state='cleaned' where id=s.id;
  update public.photos set original_status=case when original_status='pending' then 'failed' else original_status end,preview_status=case when preview_status='pending' then 'failed' else preview_status end,lifecycle_status=case when lifecycle_status='deleting' then lifecycle_status when original_status='saved' then 'active' else 'failed' end where id=s.photo_id; return '{}';
 elsif p_action='inventory' then
  return jsonb_build_object('budget',(select to_jsonb(b) from public.storage_budget b where id=1),'assets',coalesce((select jsonb_agg(jsonb_build_object('key',object_key,'bytes',size_bytes,'sha256',checksum_value)) from public.photo_assets),'[]'::jsonb),'pending',coalesce((select jsonb_agg(jsonb_build_object('key',object_key,'bytes',size_bytes)) from public.upload_items where state in ('pending','obsolete')),'[]'::jsonb));
 end if;
 raise exception 'BAD_REQUEST';
end $$;
revoke all on function public.album_photo_json(public.photos), public.album_session_json(public.upload_sessions), public.album_action(uuid,text,jsonb), public.album_maintenance(text,jsonb), public.limit_members() from public,anon,authenticated;
grant execute on function public.album_action(uuid,text,jsonb), public.album_maintenance(text,jsonb) to service_role;
