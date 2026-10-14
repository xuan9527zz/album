begin;
-- Keep the source name for interrupted uploads; object keys and bytes never change.
alter table public.upload_items add column source_filename text;
create function public.album_named_upload(p_owner uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; account_name text;
begin
  if p_action='init' then result := public.album_action(p_owner,p_action,p_data);
  elsif p_action='supplement' then result := public.album_v3_action(p_owner,p_action,p_data);
  else raise exception 'BAD_REQUEST'; end if;
  select coalesce(nullif(regexp_replace(regexp_replace(btrim(display_name),'[[:cntrl:]<>:"/\\|?*]','_','g'),'[. ]+$',''),''),'用户')
    into account_name from public.profiles where user_id=p_owner;
  update public.upload_items set source_filename=original_filename,
    original_filename=account_name||'_'||photo_id||'.'||case
      when mime_type='image/jpeg' and lower(substring(original_filename from '\.([^.]+)$'))='jpeg' then 'jpeg'
      when mime_type='image/jpeg' then 'jpg'
      when mime_type='image/png' then 'png'
      when mime_type in ('image/heic','image/heif') and lower(substring(original_filename from '\.([^.]+)$'))='hif' then 'hif'
      when mime_type='image/heic' then 'heic'
      when mime_type='image/heif' then 'heif'
      when mime_type='video/quicktime' then 'mov'
      when mime_type='video/mp4' then 'mp4'
    end
    where session_id=(result->>'id')::uuid and owner_id=p_owner and source_filename is null;
  select public.album_session_json(s) into result from public.upload_sessions s
    where s.id=(result->>'id')::uuid and s.owner_id=p_owner;
  return result;
end $$;
revoke all on function public.album_named_upload(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.album_named_upload(uuid,text,jsonb) to service_role;
commit;
