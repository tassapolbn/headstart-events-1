-- ============================================================
-- PATCH 7 (September 2026): Survey, questionnaire and feedback forms
-- ------------------------------------------------------------
-- Events now have a form type stored in events.settings->>'formType':
--   'registration' (default, unchanged behaviour) or 'survey'.
--
-- For survey forms only:
--   * the email address is optional (anonymous responses are allowed),
--     but when given it must still be a valid address;
--   * the duplicate email check only runs when an email is given.
-- Registration forms keep exactly the same rules as before.
--
-- The patch edits the submit_registration function that is currently
-- installed (whichever earlier patch version it is), so it is safe to
-- run on any database. Run once in: Supabase Dashboard -> SQL Editor
-- ============================================================

do $patch$
declare
  v_sig  regprocedure := 'public.submit_registration(uuid,text,text,text,jsonb,uuid,boolean,text,integer,uuid[])'::regprocedure;
  v_def  text;
  v_old_email text := $s$if coalesce(p_email, '') = '' or p_email !~* $s$;
  v_new_email text := $s$if (coalesce(p_email, '') = '' and coalesce(v_event.settings->>'formType', 'registration') <> 'survey') or nullif(p_email, '') !~* $s$;
  v_old_dup text := $s$if not v_allow_dup then$s$;
  v_new_dup text := $s$if not v_allow_dup and coalesce(p_email, '') <> '' then$s$;
begin
  v_def := pg_get_functiondef(v_sig);

  if position('formType' in v_def) > 0 then
    raise notice 'submit_registration already supports survey forms. Nothing to do.';
    return;
  end if;
  if position(v_old_email in v_def) = 0 then
    raise exception 'PATCH 7: email check not found in submit_registration. Please contact the developer.';
  end if;
  if position(v_old_dup in v_def) = 0 then
    raise exception 'PATCH 7: duplicate email check not found in submit_registration. Please contact the developer.';
  end if;

  v_def := replace(v_def, v_old_email, v_new_email);
  v_def := replace(v_def, v_old_dup, v_new_dup);
  execute v_def;
end
$patch$;

grant execute on function public.submit_registration(uuid, text, text, text, jsonb, uuid, boolean, text, int, uuid[]) to anon, authenticated;
