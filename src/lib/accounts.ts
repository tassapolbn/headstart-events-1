import { supabase } from './supabase';

/**
 * Staff sign in with a username. Supabase Auth stores an email
 * internally, so a username becomes <username>@accounts.headstartphuket.com.
 * No email is ever sent there; it is only an internal identifier.
 * This must match USERNAME_DOMAIN in supabase/functions/admin-users/index.ts.
 */
export const USERNAME_DOMAIN = 'accounts.headstartphuket.com';

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const MIN_PASSWORD = 8;

/** Turn whatever the person typed on the login form into a sign-in email. */
export function loginIdentifierToEmail(input: string): string {
  const value = input.trim();
  if (value.includes('@')) return value.toLowerCase();
  return `${value.toLowerCase()}@${USERNAME_DOMAIN}`;
}

export interface AccountUser {
  id: string;
  username: string;
  display_name: string;
  email: string;
  role: 'owner' | 'staff';
  is_username_account: boolean;
  created_at: string;
  last_sign_in_at: string | null;
}

const messages: Record<string, string> = {
  NOT_AUTHENTICATED: 'Your session has expired. Please sign in again.',
  NOT_OWNER: 'Only an Admin account can manage staff accounts.',
  INVALID_USERNAME: 'Usernames must be 3 to 32 characters: lowercase letters, numbers, dots, dashes or underscores.',
  WEAK_PASSWORD: `Passwords must be at least ${MIN_PASSWORD} characters.`,
  USERNAME_TAKEN: 'That username is already in use.',
  CANNOT_DELETE_SELF: 'You cannot delete the account you are signed in with.',
  LAST_OWNER: 'This is the only Admin account, so it cannot be removed or demoted.',
  NOT_FOUND: 'That account no longer exists.',
};

export function accountError(raw: string): string {
  return messages[raw] ?? raw ?? 'Something went wrong.';
}

/** Call the admin-users Edge Function. The service key never touches the browser. */
async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    // Supabase wraps non-2xx responses; dig out the real message when possible.
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const parsed = await ctx.json();
        if (parsed?.error) detail = parsed.error;
      } catch { /* keep the generic message */ }
    }
    throw new Error(detail);
  }
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(String((data as { error: string }).error));
  }
  return data as T;
}

export function listAccounts() {
  return call<{ users: AccountUser[]; caller_id: string }>({ action: 'list' });
}

export function createAccount(input: { username: string; password: string; display_name: string; role: 'owner' | 'staff' }) {
  return call<{ user: AccountUser }>({ action: 'create', ...input });
}

export function setAccountPassword(id: string, password: string) {
  return call<{ ok: true }>({ action: 'set_password', id, password });
}

export function setAccountUsername(id: string, username: string) {
  return call<{ ok: true }>({ action: 'set_username', id, username });
}

export function updateAccountProfile(id: string, input: { display_name?: string; role?: 'owner' | 'staff'; username?: string }) {
  return call<{ ok: true }>({ action: 'update_profile', id, ...input });
}

export function deleteAccount(id: string) {
  return call<{ ok: true }>({ action: 'delete', id });
}

/** Suggest a readable temporary password the owner can hand over. */
export function suggestPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}
