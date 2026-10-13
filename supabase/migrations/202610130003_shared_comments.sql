-- Small text-only comments on actively shared photos. Private photos stay private.
begin;
create table public.photo_comments (
 id uuid primary key default gen_random_uuid(),
 photo_id uuid not null references public.photos(id) on delete cascade,
 author_id uuid not null references public.profiles(user_id),
 body text not null check (char_length(btrim(body)) between 1 and 30),
 created_at timestamptz not null default now()
);
create index photo_comments_page on public.photo_comments(photo_id,created_at,id);
alter table public.photo_comments enable row level security;
revoke all on public.photo_comments from public,anon,authenticated;
grant all on public.photo_comments to service_role;

create function public.album_v4_action(p_owner uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.photos; c public.photo_comments; result jsonb; cnt integer;
begin
 if not exists(select 1 from public.profiles where user_id=p_owner and is_active) then
  raise exception 'NOT_MEMBER';
 end if;
 select * into p from public.photos where id=(p_data->>'photo_id')::uuid
  and is_shared and lifecycle_status='active';
 if p.id is null then raise exception 'NOT_FOUND'; end if;
 if p_action='list' then
  return jsonb_build_object('comments',coalesce((
   select jsonb_agg(jsonb_build_object(
    'id',q.id,'body',q.body,'created_at',q.created_at,
    'author_name',pr.display_name,'can_delete',q.author_id=p_owner or p.owner_id=p_owner)
    order by q.created_at,q.id)
   from public.photo_comments q join public.profiles pr on pr.user_id=q.author_id
   where q.photo_id=p.id
  ),'[]'::jsonb));
 elsif p_action='add' then
  insert into public.request_limits values(p_owner,date_trunc('minute',now()),1)
   on conflict(owner_id) do update set minute=excluded.minute,
    requests=case when request_limits.minute=excluded.minute then request_limits.requests+1 else 1 end
   returning requests into cnt;
  if cnt>180 then raise exception 'RATE_LIMIT'; end if;
  if char_length(btrim(coalesce(p_data->>'body',''))) not between 1 and 30 then
   raise exception 'BAD_REQUEST';
  end if;
  select * into p from public.photos where id=p.id and is_shared
   and lifecycle_status='active' for update;
  if p.id is null then raise exception 'NOT_FOUND'; end if;
  if (select count(*) from public.photo_comments where photo_id=p.id)>=200 then
   raise exception 'COMMENT_LIMIT';
  end if;
  insert into public.photo_comments(photo_id,author_id,body)
   values(p.id,p_owner,btrim(p_data->>'body')) returning * into c;
  return jsonb_build_object('id',c.id,'body',c.body,'created_at',c.created_at,
   'author_name',(select display_name from public.profiles where user_id=p_owner),
   'can_delete',true);
 elsif p_action='delete' then
  select * into c from public.photo_comments where id=(p_data->>'comment_id')::uuid
   and photo_id=p.id for update;
  if c.id is null or (c.author_id<>p_owner and p.owner_id<>p_owner) then
   raise exception 'NOT_FOUND';
  end if;
  delete from public.photo_comments where id=c.id;
  return jsonb_build_object('deleted',c.id);
 end if;
 raise exception 'BAD_REQUEST';
end $$;
revoke all on function public.album_v4_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.album_v4_action(uuid,text,jsonb) to service_role;
commit;
