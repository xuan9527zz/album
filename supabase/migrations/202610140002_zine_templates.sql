begin;
alter table public.story_albums add column zine_config jsonb;
alter table public.story_albums drop constraint story_albums_template_check;
alter table public.story_albums add constraint story_albums_template_check
  check(template in ('journal','cinema','postcard','zine-city','zine-diary','zine-coast'));
alter table public.story_albums add constraint story_albums_zine_config_check
  check(zine_config is null or (jsonb_typeof(zine_config)='object' and zine_config->>'version'='1' and jsonb_typeof(zine_config->'pages')='array'));

-- Delegate existing ownership, sharing and photo availability checks to v6.
create function public.album_v7_action(p_owner uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; cfg jsonb; page jsonb; binding jsonb; prop record;
  requested_template text; layout text; capacity integer; ids uuid[]; page_ids text[] := '{}';
  safe_pages jsonb := '[]'; safe_slots jsonb; visible_ids text[];
begin
  if p_action in ('create','update') then
    requested_template := coalesce(p_data->>'template','');
    cfg := p_data->'zine_config';
    if requested_template in ('zine-city','zine-diary','zine-coast') then
      if cfg is null or jsonb_typeof(cfg)<>'object' or cfg->'version'<>'1'::jsonb
        or jsonb_typeof(cfg->'pages')<>'array'
        or jsonb_array_length(cfg->'pages') not between 1 and 60
        or exists(select 1 from jsonb_object_keys(cfg) k where k not in ('version','pages'))
        or jsonb_typeof(p_data->'photo_ids')<>'array' then raise exception 'BAD_REQUEST'; end if;
      select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_data->'photo_ids');
      for page in select value from jsonb_array_elements(cfg->'pages') loop
        layout := page->>'layout';
        capacity := case when layout in ('city-pause','diary-small','diary-keepsakes','coast-layer','coast-ending') then 2
          when layout='city-sequence' then 3
          when layout in ('city-opening','city-window','diary-opening','diary-band','coast-opening','coast-band') then 1 else 0 end;
        if jsonb_typeof(page)<>'object' or capacity=0 or requested_template<>'zine-'||split_part(layout,'-',1)
          or coalesce(page->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          or page->>'id'=any(page_ids)
          or jsonb_typeof(page->'photo_ids')<>'array' or jsonb_array_length(page->'photo_ids')<>capacity
          or jsonb_typeof(page->'texts')<>'object'
          or exists(select 1 from jsonb_object_keys(page) k where k not in ('id','layout','photo_ids','texts')) then raise exception 'BAD_REQUEST'; end if;
        page_ids := array_append(page_ids,page->>'id');
        if not exists(select 1 from jsonb_array_elements(page->'photo_ids') x where x.value<>'null'::jsonb)
          or (select count(*) from jsonb_array_elements_text(page->'photo_ids') x where x.value is not null)
            <> (select count(distinct value) from jsonb_array_elements_text(page->'photo_ids') x where x.value is not null) then raise exception 'BAD_REQUEST'; end if;
        for binding in select value from jsonb_array_elements(page->'photo_ids') loop
          if binding='null'::jsonb then continue; end if;
          if jsonb_typeof(binding)<>'string' or (binding#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then raise exception 'BAD_REQUEST'; end if;
          if not (binding#>>'{}')::uuid=any(ids) then raise exception 'BAD_REQUEST'; end if;
        end loop;
        if (select count(*) from jsonb_object_keys(page->'texts'))>30 then raise exception 'BAD_REQUEST'; end if;
        for prop in select * from jsonb_each(page->'texts') loop
          if prop.key !~ '^[a-z][a-z0-9-]{0,49}$' or jsonb_typeof(prop.value)<>'string'
            or char_length(prop.value#>>'{}')>600 then raise exception 'BAD_REQUEST'; end if;
        end loop;
      end loop;
      if exists(select 1 from unnest(ids) requested(id) where not exists(
        select 1 from jsonb_array_elements(cfg->'pages') page_row,
          jsonb_array_elements_text(page_row->'photo_ids') slot
        where slot.value=requested.id::text)) then raise exception 'BAD_REQUEST'; end if;
      result := public.album_v6_action(p_owner,p_action,p_data||jsonb_build_object('template','journal'));
      update public.story_albums set template=requested_template,zine_config=cfg
        where id=(result->>'id')::uuid and owner_id=p_owner;
    else
      if cfg is not null and cfg<>'null'::jsonb then raise exception 'BAD_REQUEST'; end if;
      result := public.album_v6_action(p_owner,p_action,p_data);
      update public.story_albums set zine_config=null where id=(result->>'id')::uuid and owner_id=p_owner;
    end if;
    return public.album_v7_action(p_owner,'detail',jsonb_build_object('story_id',result->>'id'));
  end if;
  result := public.album_v6_action(p_owner,p_action,p_data);
  if p_action='list' then
    return jsonb_build_object('stories',coalesce((select jsonb_agg(value-'zine_config' order by ordinality)
      from jsonb_array_elements(result->'stories') with ordinality),'[]'::jsonb));
  end if;
  if p_action='detail' and result->'zine_config' is not null and result->'zine_config'<>'null'::jsonb then
    select array_agg(value->>'id') into visible_ids from jsonb_array_elements(result->'photos');
    -- Keep slot positions while removing references to deleted or unshared photos.
    for page in select value from jsonb_array_elements(result->'zine_config'->'pages') loop
      select jsonb_agg(case when value=any(coalesce(visible_ids,'{}')) then to_jsonb(value) else 'null'::jsonb end order by ordinality)
        into safe_slots from jsonb_array_elements_text(page->'photo_ids') with ordinality;
      safe_pages := safe_pages||jsonb_build_array(page||jsonb_build_object('photo_ids',safe_slots));
    end loop;
    result := jsonb_set(result,'{zine_config,pages}',safe_pages);
  end if;
  return result;
end $$;
revoke all on function public.album_v7_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.album_v7_action(uuid,text,jsonb) to service_role;
commit;
