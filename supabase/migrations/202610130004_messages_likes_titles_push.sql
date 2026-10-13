begin;

alter table public.photos add column title text check (title is null or char_length(title) <= 80);
-- Preserve existing gallery captions; members can now edit title and place separately.
update public.photos set title=left(location_label,80) where title is null and location_label is not null;
create function public.album_photo_title_from_upload() returns trigger language plpgsql set search_path='' as $$
begin
  new.title := nullif(btrim(new.source_metadata->>'title'), '');
  return new;
end $$;
create trigger photo_title_from_upload before insert on public.photos
  for each row execute function public.album_photo_title_from_upload();

create table public.photo_likes (
  photo_id uuid not null references public.photos(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  primary key(photo_id,user_id)
);
create index photo_likes_by_user on public.photo_likes(user_id,created_at desc);
create table public.family_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(user_id),
  body text not null check (char_length(btrim(body)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index family_messages_recent on public.family_messages(created_at desc,id desc);
create table public.album_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(user_id),
  actor_id uuid not null references public.profiles(user_id),
  kind text not null check(kind in ('comment','like','chat')),
  photo_id uuid references public.photos(id) on delete cascade,
  source_id uuid not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(recipient_id,actor_id,kind,source_id)
);
create index album_notifications_inbox on public.album_notifications(recipient_id,created_at desc,id desc);
create index album_notifications_unread on public.album_notifications(recipient_id) where read_at is null;
create table public.push_subscriptions (
  endpoint text primary key check(char_length(endpoint) between 30 and 1500),
  user_id uuid not null references public.profiles(user_id),
  p256dh text not null check(char_length(p256dh) between 40 and 200),
  auth text not null check(char_length(auth) between 10 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions(user_id);
alter table public.photo_likes enable row level security;
alter table public.family_messages enable row level security;
alter table public.album_notifications enable row level security;
alter table public.push_subscriptions enable row level security;
revoke all on public.photo_likes,public.family_messages,public.album_notifications,public.push_subscriptions from public,anon,authenticated;
grant all on public.photo_likes,public.family_messages,public.album_notifications,public.push_subscriptions to service_role;

create function public.album_v5_comment_notice() returns trigger language plpgsql set search_path='' as $$
declare photo_owner uuid;
begin
  if tg_op='DELETE' then
    delete from public.album_notifications where kind='comment' and source_id=old.id;
    return old;
  end if;
  select owner_id into photo_owner from public.photos where id=new.photo_id and is_shared and lifecycle_status='active';
  if photo_owner is not null and photo_owner<>new.author_id then
    insert into public.album_notifications(recipient_id,actor_id,kind,photo_id,source_id)
      values(photo_owner,new.author_id,'comment',new.photo_id,new.id);
  end if;
  return new;
end $$;
create trigger photo_comment_notice_insert after insert on public.photo_comments
  for each row execute function public.album_v5_comment_notice();
create trigger photo_comment_notice_delete after delete on public.photo_comments
  for each row execute function public.album_v5_comment_notice();

create function public.album_v5_action(p_owner uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.photos; n public.album_notifications; msg public.family_messages;
  answer jsonb; desired boolean; cnt integer; title_value text;
begin
  if not exists(select 1 from public.profiles where user_id=p_owner and is_active) then
    raise exception 'NOT_MEMBER';
  end if;
  if p_action in ('edit','like','chat_send','push_subscribe','push_unsubscribe') then
    insert into public.request_limits values(p_owner,date_trunc('minute',now()),1)
      on conflict(owner_id) do update set minute=excluded.minute,
      requests=case when request_limits.minute=excluded.minute then request_limits.requests+1 else 1 end
      returning requests into cnt;
    if cnt>180 then raise exception 'RATE_LIMIT'; end if;
  end if;
  if p_action='list' then
    return jsonb_build_object('photos',coalesce((
      select jsonb_agg(public.album_photo_json(q) || jsonb_build_object(
        'is_owner',q.owner_id=p_owner,'owner_name',owner_profile.display_name,
        'liked_by_me',exists(select 1 from public.photo_likes mine where mine.photo_id=q.id and mine.user_id=p_owner),
        'like_count',(select count(*) from public.photo_likes all_likes where all_likes.photo_id=q.id))
        order by q.sort_date desc,q.uploaded_at desc,q.id desc)
      from (select * from public.photos where
        (case when coalesce((p_data->>'shared')::boolean,false) then
          is_shared and lifecycle_status='active'
        when coalesce((p_data->>'featured')::boolean,false) then
          (owner_id=p_owner and is_featured and lifecycle_status not in ('trashed','deleting'))
          or (is_shared and lifecycle_status='active' and exists
            (select 1 from public.photo_likes mine where mine.photo_id=photos.id and mine.user_id=p_owner))
        else owner_id=p_owner and lifecycle_status not in ('trashed','deleting') end)
        and (p_data->>'year' is null or extract(year from sort_date)=(p_data->>'year')::integer)
        and (p_data->>'month' is null or extract(month from sort_date)=(p_data->>'month')::integer)
        and (p_data->>'place' is null or position(lower(p_data->>'place') in lower(coalesce(location_label,'')))>0)
        and (p_data->>'owner' is null or owner_id=(p_data->>'owner')::uuid)
        and (p_data->'cursor' is null or (sort_date,uploaded_at,id)<
          ((p_data#>>'{cursor,sort_date}')::date,(p_data#>>'{cursor,uploaded_at}')::timestamptz,(p_data#>>'{cursor,id}')::uuid))
        order by sort_date desc,uploaded_at desc,id desc
        limit least(coalesce((p_data->>'limit')::integer,24),48)) q
      join public.profiles owner_profile on owner_profile.user_id=q.owner_id
    ),'[]'::jsonb));
  elsif p_action='photo' then
    answer := public.album_v3_action(p_owner,'photo',p_data);
    return answer || jsonb_build_object(
      'liked_by_me',exists(select 1 from public.photo_likes where photo_id=(p_data->>'photo_id')::uuid and user_id=p_owner),
      'like_count',(select count(*) from public.photo_likes where photo_id=(p_data->>'photo_id')::uuid));
  elsif p_action='edit' then
    if jsonb_typeof(p_data->'metadata')<>'object' then raise exception 'BAD_REQUEST'; end if;
    if p_data->'metadata' ? 'title' then
      title_value := nullif(btrim(p_data#>>'{metadata,title}'),'');
      if char_length(title_value)>80 then raise exception 'BAD_REQUEST'; end if;
    end if;
    answer := public.album_v3_action(p_owner,'edit',jsonb_build_object(
      'photo_id',p_data->>'photo_id','metadata',(p_data->'metadata')-'title'));
    if p_data->'metadata' ? 'title' then
      update public.photos set title=title_value,updated_at=now()
        where id=(p_data->>'photo_id')::uuid and owner_id=p_owner;
    end if;
    return public.album_v5_action(p_owner,'photo',jsonb_build_object('photo_id',p_data->>'photo_id'));
  elsif p_action='like' then
    select * into p from public.photos where id=(p_data->>'photo_id')::uuid
      and is_shared and lifecycle_status='active' for update;
    if p.id is null or jsonb_typeof(p_data->'liked')<>'boolean' then raise exception 'NOT_FOUND'; end if;
    desired := (p_data->>'liked')::boolean;
    if desired then
      insert into public.photo_likes(photo_id,user_id) values(p.id,p_owner) on conflict do nothing;
      get diagnostics cnt = row_count;
      if p.owner_id<>p_owner and cnt>0 then
        insert into public.album_notifications(recipient_id,actor_id,kind,photo_id,source_id)
          values(p.owner_id,p_owner,'like',p.id,p.id)
          on conflict(recipient_id,actor_id,kind,source_id) do update set created_at=now(),read_at=null;
      end if;
    else
      delete from public.photo_likes where photo_id=p.id and user_id=p_owner;
      delete from public.album_notifications where kind='like' and photo_id=p.id and actor_id=p_owner;
    end if;
    return public.album_v5_action(p_owner,'photo',jsonb_build_object('photo_id',p.id));
  elsif p_action='notifications' then
    return jsonb_build_object('unread_count',(select count(*) from public.album_notifications
      where recipient_id=p_owner and read_at is null),
      'items',coalesce((select jsonb_agg(jsonb_build_object(
        'id',a.id,'kind',a.kind,'photo_id',a.photo_id,'created_at',a.created_at,
        'read_at',a.read_at,'actor_name',actor.display_name,'photo_title',photo_row.title)
        order by a.created_at desc,a.id desc)
        from (select * from public.album_notifications where recipient_id=p_owner
          order by created_at desc,id desc limit 100) a
        join public.profiles actor on actor.user_id=a.actor_id
        left join public.photos photo_row on photo_row.id=a.photo_id),'[]'::jsonb));
  elsif p_action='notifications_read' then
    update public.album_notifications set read_at=now() where recipient_id=p_owner and read_at is null;
    return jsonb_build_object('unread_count',0);
  elsif p_action='chat_list' then
    return jsonb_build_object('messages',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'body',m.body,'created_at',m.created_at,'sender_id',m.sender_id,
      'sender_name',sender.display_name) order by m.created_at,m.id)
      from (select * from public.family_messages order by created_at desc,id desc limit 100) m
      join public.profiles sender on sender.user_id=m.sender_id),'[]'::jsonb));
  elsif p_action='chat_send' then
    if char_length(btrim(coalesce(p_data->>'body',''))) not between 1 and 300 then raise exception 'BAD_REQUEST'; end if;
    insert into public.family_messages(sender_id,body) values(p_owner,btrim(p_data->>'body')) returning * into msg;
    insert into public.album_notifications(recipient_id,actor_id,kind,source_id)
      select user_id,p_owner,'chat',msg.id from public.profiles where is_active and user_id<>p_owner;
    return jsonb_build_object('id',msg.id,'body',msg.body,'created_at',msg.created_at,
      'sender_id',p_owner,'sender_name',(select display_name from public.profiles where user_id=p_owner));
  elsif p_action='push_subscribe' then
    insert into public.push_subscriptions(endpoint,user_id,p256dh,auth)
      values(p_data->>'endpoint',p_owner,p_data->>'p256dh',p_data->>'auth')
      on conflict(endpoint) do update set user_id=excluded.user_id,p256dh=excluded.p256dh,
        auth=excluded.auth,updated_at=now();
    return jsonb_build_object('subscribed',true);
  elsif p_action='push_unsubscribe' then
    delete from public.push_subscriptions where endpoint=p_data->>'endpoint' and user_id=p_owner;
    return jsonb_build_object('subscribed',false);
  elsif p_action='push_event' then
    return coalesce((select jsonb_agg(jsonb_build_object(
      'endpoint',sub.endpoint,'p256dh',sub.p256dh,'auth',sub.auth,
      'kind',a.kind,'actor_name',actor.display_name,'photo_id',a.photo_id))
      from public.album_notifications a
      join public.push_subscriptions sub on sub.user_id=a.recipient_id
      join public.profiles actor on actor.user_id=a.actor_id
      where a.actor_id=p_owner and a.source_id=(p_data->>'source_id')::uuid
        and a.created_at>now()-interval '10 minutes'),'[]'::jsonb);
  end if;
  raise exception 'BAD_REQUEST';
end $$;
revoke all on function public.album_photo_title_from_upload(),public.album_v5_comment_notice(),
  public.album_v5_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.album_v5_action(uuid,text,jsonb) to service_role;
commit;
