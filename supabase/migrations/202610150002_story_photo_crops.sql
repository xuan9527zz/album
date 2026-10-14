begin;
-- Store only bounded framing values; existing photo ownership checks remain in v10.
create function public.album_v11_action(p_owner uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg jsonb; page jsonb; crop jsonb; field text; delegated jsonb; result jsonb; pages jsonb := '[]';
begin
  if p_action not in ('create','update') then return public.album_v10_action(p_owner,p_action,p_data); end if;
  cfg := p_data->'zine_config';
  if jsonb_typeof(cfg->'pages')='array' then
    for page in select value from jsonb_array_elements(cfg->'pages') loop
      if page ? 'photo_crops' then
        if jsonb_typeof(page->'photo_crops') is distinct from 'array'
          or jsonb_typeof(page->'photo_ids') is distinct from 'array'
          or jsonb_array_length(page->'photo_crops')<>jsonb_array_length(page->'photo_ids')
          or jsonb_array_length(page->'photo_crops') not between 1 and 3 then raise exception 'BAD_REQUEST'; end if;
        for crop in select value from jsonb_array_elements(page->'photo_crops') loop
          if crop='null'::jsonb then continue; end if;
          if jsonb_typeof(crop)<>'object' or not(crop ?& array['zoom','x','y'])
            or exists(select 1 from jsonb_object_keys(crop) k where k not in ('zoom','x','y')) then raise exception 'BAD_REQUEST'; end if;
          foreach field in array array['zoom','x','y'] loop
            if jsonb_typeof(crop->field) is distinct from 'number' then raise exception 'BAD_REQUEST'; end if;
          end loop;
          if (crop->>'zoom')::numeric not between 1 and 5 or (crop->>'x')::numeric not between -2 and 2
            or (crop->>'y')::numeric not between -2 and 2 then raise exception 'BAD_REQUEST'; end if;
        end loop;
      end if;
      pages := pages||jsonb_build_array(page-'photo_crops');
    end loop;
    delegated := p_data||jsonb_build_object('zine_config',jsonb_set(cfg,'{pages}',pages));
  else delegated := p_data; end if;
  result := public.album_v10_action(p_owner,p_action,delegated);
  if jsonb_typeof(cfg->'pages')='array' then
    update public.story_albums set zine_config=jsonb_set(zine_config,'{pages}',cfg->'pages')
      where id=(result->>'id')::uuid and owner_id=p_owner;
  end if;
  return public.album_v10_action(p_owner,'detail',jsonb_build_object('story_id',result->>'id'));
end $$;
revoke all on function public.album_v11_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.album_v11_action(uuid,text,jsonb) to service_role;
commit;
