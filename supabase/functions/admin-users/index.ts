// ============================================================
// HeadStart Events - admin-users Edge Function
// ============================================================
// Lets a signed-in OWNER manage staff accounts from the admin UI
// without anybody sharing a password, and without the service key
// ever touching the browser.
//
// Accounts sign in with a username. Supabase Auth needs an email
// address internally, so a username is stored as
// <username>@accounts.headstartphuket.com. No mail is ever sent
// to that address; it is only an internal identifier.
//
// Security notes:
//  - The role lives in app_metadata, which a user cannot change
//    themselves, so staff cannot promote themselves to owner.
//  - Only explicitly provisioned owners may manage accounts.
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const USERNAME_DOMAIN = 'accounts.headstartphuket.com';
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const MIN_PASSWORD = 8;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function emailFor(username: string) {
  return `${username}@${USERNAME_DOMAIN}`;
}

interface PublicUser {
  id: string;
  username: string;
  display_name: string;
  email: string;
  role: string;
  is_username_account: boolean;
  created_at: string;
  last_sign_in_at: string | null;
}

// deno-lint-ignore no-explicit-any
function toPublic(u: any): PublicUser {
  const email: string = u.email ?? '';
  const isUsernameAccount = email.endsWith(`@${USERNAME_DOMAIN}`);
  return {
    id: u.id,
    username: u.user_metadata?.username ?? (isUsernameAccount ? email.split('@')[0] : email),
    display_name: u.user_metadata?.display_name ?? '',
    email,
    role: u.app_metadata?.role ?? 'staff',
    is_username_account: isUsernameAccount,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // ---- who is calling? ----------------------------------------
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'NOT_AUTHENTICATED' }, 401);

  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller?.user) return json({ error: 'NOT_AUTHENTICATED' }, 401);
  const callerId = caller.user.id;

  // ---- gather every account (also used for the owner check) ----
  const all: unknown[] = [];
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return json({ error: error.message }, 500);
    all.push(...data.users);
    if (data.users.length < 200) break;
    if (page === 100) return json({ error: 'ACCOUNT_LIMIT_EXCEEDED' }, 503);
  }
  // deno-lint-ignore no-explicit-any
  const users = all as any[];
  const owners = users.filter((u) => u.app_metadata?.role === 'owner');
  const callerIsOwner = owners.some((u) => u.id === callerId);

  if (!callerIsOwner) return json({ error: 'NOT_OWNER' }, 403);

  let body: Record<string, string> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'BAD_REQUEST' }, 400);
  }
  const action = body.action ?? '';

  // ---- actions -------------------------------------------------
  try {
    if (action === 'list') {
      return json({
        users: users.map(toPublic).sort((a, b) => a.username.localeCompare(b.username)),
        caller_id: callerId,
      });
    }

    if (action === 'create') {
      const username = String(body.username ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      const displayName = String(body.display_name ?? '').trim();
      const role = body.role === 'owner' ? 'owner' : 'staff';

      if (!USERNAME_RE.test(username)) return json({ error: 'INVALID_USERNAME' }, 400);
      if (password.length < MIN_PASSWORD) return json({ error: 'WEAK_PASSWORD' }, 400);
      if (users.some((u) => (u.user_metadata?.username ?? '') === username || u.email === emailFor(username))) {
        return json({ error: 'USERNAME_TAKEN' }, 409);
      }

      const { data, error } = await admin.auth.admin.createUser({
        email: emailFor(username),
        password,
        email_confirm: true,
        user_metadata: { username, display_name: displayName },
        app_metadata: { role },
      });
      if (error) return json({ error: error.message }, 400);
      return json({ user: toPublic(data.user) });
    }

    if (action === 'set_password') {
      const id = String(body.id ?? '');
      const password = String(body.password ?? '');
      if (!id) return json({ error: 'BAD_REQUEST' }, 400);
      if (password.length < MIN_PASSWORD) return json({ error: 'WEAK_PASSWORD' }, 400);
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'set_username') {
      const id = String(body.id ?? '');
      const username = String(body.username ?? '').trim().toLowerCase();
      if (!id || !USERNAME_RE.test(username)) return json({ error: 'INVALID_USERNAME' }, 400);
      if (users.some((u) => u.id !== id && ((u.user_metadata?.username ?? '') === username || u.email === emailFor(username)))) {
        return json({ error: 'USERNAME_TAKEN' }, 409);
      }
      const target = users.find((u) => u.id === id);
      if (!target) return json({ error: 'NOT_FOUND' }, 404);
      const { error } = await admin.auth.admin.updateUserById(id, {
        email: emailFor(username),
        email_confirm: true,
        user_metadata: { ...(target.user_metadata ?? {}), username },
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'update_profile') {
      const id = String(body.id ?? '');
      const target = users.find((u) => u.id === id);
      if (!target) return json({ error: 'NOT_FOUND' }, 404);

      const username = body.username === undefined ? undefined : String(body.username).trim().toLowerCase();
      if (username !== undefined) {
        if (!USERNAME_RE.test(username)) return json({ error: 'INVALID_USERNAME' }, 400);
        if (users.some((u) => u.id !== id && u.email === emailFor(username))) {
          return json({ error: 'USERNAME_TAKEN' }, 409);
        }
      }
      const displayName = String(body.display_name ?? target.user_metadata?.display_name ?? '');
      const role = body.role === 'owner' ? 'owner' : body.role === 'staff' ? 'staff' : undefined;

      // Never let the last owner demote themselves and lock everyone out.
      if (role === 'staff' && target.app_metadata?.role === 'owner' && owners.length <= 1) {
        return json({ error: 'LAST_OWNER' }, 400);
      }

      const { error } = await admin.auth.admin.updateUserById(id, {
        ...(username !== undefined ? { email: emailFor(username), email_confirm: true } : {}),
        user_metadata: { ...(target.user_metadata ?? {}), display_name: displayName, ...(username !== undefined ? { username } : {}) },
        ...(role ? { app_metadata: { ...(target.app_metadata ?? {}), role } } : {}),
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'delete') {
      const id = String(body.id ?? '');
      if (!id) return json({ error: 'BAD_REQUEST' }, 400);
      if (id === callerId) return json({ error: 'CANNOT_DELETE_SELF' }, 400);
      const target = users.find((u) => u.id === id);
      if (!target) return json({ error: 'NOT_FOUND' }, 404);
      if (target.app_metadata?.role === 'owner' && owners.length <= 1) {
        return json({ error: 'LAST_OWNER' }, 400);
      }
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'UNKNOWN_ACTION' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'SERVER_ERROR' }, 500);
  }
});
