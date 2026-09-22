import { Link } from 'react-router-dom';
import { useEffect, useState, type FormEvent } from 'react';
import {
  Copy, KeyRound, Pencil, RefreshCw, ShieldCheck, Trash2, UserPlus, Users,
} from 'lucide-react';
import {
  accountError, createAccount, deleteAccount, listAccounts, setAccountPassword,
  suggestPassword, updateAccountProfile, USERNAME_RE, MIN_PASSWORD,
  type AccountUser,
} from '@/lib/accounts';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { formatDateTime } from '@/lib/utils';
import { Badge, Button, Card, EmptyState, PageLoader } from '@/components/ui/basics';
import { Field, Input, Select } from '@/components/ui/inputs';
import { ConfirmDialog, Modal } from '@/components/ui/overlays';

export default function AccountsPage() {
  const { toast } = useToast();
  const { session } = useAuth();
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [callerId, setCallerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState<string | null>(null);

  // Create
  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState(suggestPassword());
  const [role, setRole] = useState<'owner' | 'staff'>('staff');
  const [busy, setBusy] = useState(false);

  // Edit / password / delete
  const [editUser, setEditUser] = useState<AccountUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editRole, setEditRole] = useState<'owner' | 'staff'>('staff');
  const [pwUser, setPwUser] = useState<AccountUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [deleteUser, setDeleteUser] = useState<AccountUser | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await listAccounts();
      setUsers(res.users);
      setCallerId(res.caller_id);
      setDenied(null);
    } catch (err) {
      setDenied(accountError(err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const u = username.trim().toLowerCase();
    if (!USERNAME_RE.test(u)) { toast(accountError('INVALID_USERNAME'), 'error'); return; }
    if (password.length < MIN_PASSWORD) { toast(accountError('WEAK_PASSWORD'), 'error'); return; }
    setBusy(true);
    try {
      await createAccount({ username: u, password, display_name: displayName.trim(), role });
      toast(`Account "${u}" created. Give them the username and password.`);
      setCreateOpen(false);
      setUsername(''); setDisplayName(''); setPassword(suggestPassword()); setRole('staff');
      void load();
    } catch (err) {
      toast(accountError(err instanceof Error ? err.message : ''), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit() {
    if (!editUser) return;
    if (busy) return;
    const nextUsername = editUsername.trim().toLowerCase();
    if (editUser.is_username_account && !USERNAME_RE.test(nextUsername)) {
      toast(accountError('INVALID_USERNAME'), 'error'); return;
    }
    setBusy(true);
    try {
      await updateAccountProfile(editUser.id, {
        display_name: editName.trim(), role: editRole,
        ...(editUser.is_username_account ? { username: nextUsername } : {}),
      });
      toast('Account updated.');
      setEditUser(null);
      void load();
    } catch (err) {
      toast(accountError(err instanceof Error ? err.message : ''), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleSetPassword() {
    if (!pwUser || busy) return;
    if (newPassword.length < MIN_PASSWORD) { toast(accountError('WEAK_PASSWORD'), 'error'); return; }
    setBusy(true);
    try {
      await setAccountPassword(pwUser.id, newPassword);
      toast(`New password set for "${pwUser.username}". Share it with them directly.`);
      setPwUser(null);
    } catch (err) {
      toast(accountError(err instanceof Error ? err.message : ''), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleteUser || busy) return;
    setBusy(true);
    try {
      await deleteAccount(deleteUser.id);
      toast(`Account "${deleteUser.username}" removed.`);
      void load();
    } catch (err) {
      toast(accountError(err instanceof Error ? err.message : ''), 'error');
    } finally {
      setBusy(false);
    }
  }

  function copy(text: string, what: string) {
    void navigator.clipboard.writeText(text);
    toast(`${what} copied.`);
  }

  if (loading) return <PageLoader label="Loading accounts" />;

  if (denied) {
    return (
      <div className="space-y-5">
        <h1 className="font-display text-2xl font-bold text-navy-800">Accounts</h1>
        <EmptyState
          icon={<ShieldCheck className="h-8 w-8" />}
          title="You cannot manage accounts"
          hint={denied}
          action={<Button variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={() => void load()}>Try again</Button>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link to="/admin/settings" className="text-sm font-medium text-navy-700 hover:underline">Settings / Account</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-800">Accounts</h1>
          <p className="text-sm text-slate-500">
            Give each person their own username and password. Nobody needs to share yours.
          </p>
        </div>
        <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => { setPassword(suggestPassword()); setCreateOpen(true); }}>
          Add account
        </Button>
      </div>

      {users.length === 0 ? (
        <EmptyState icon={<Users className="h-8 w-8" />} title="No accounts yet" hint="Add the first staff account." />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-slate-100">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ background: u.role === 'owner' ? '#1a3c5e' : '#64748b' }}
                  aria-hidden="true"
                >
                  {(u.display_name || u.username).slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                    {u.display_name || u.username}
                    <Badge color={u.role === 'owner' ? 'navy' : 'gray'}>{u.role === 'owner' ? 'Admin' : 'Staff'}</Badge>
                    {u.id === callerId && <Badge color="green">You</Badge>}
                    {!u.is_username_account && <Badge color="gray">Email login</Badge>}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    <button onClick={() => copy(u.username, 'Username')} className="font-mono hover:underline" title="Copy username">
                      {u.username}
                    </button>
                    {u.last_sign_in_at ? ` - last signed in ${formatDateTime(u.last_sign_in_at)}` : ' - never signed in'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm" variant="outline" icon={<KeyRound className="h-3.5 w-3.5" />}
                    onClick={() => { setPwUser(u); setNewPassword(suggestPassword()); }}
                  >
                    Password
                  </Button>
                  <Button
                    size="sm" variant="outline" icon={<Pencil className="h-3.5 w-3.5" />}
                    onClick={() => { setEditUser(u); setEditName(u.display_name); setEditUsername(u.username); setEditRole(u.role); }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="text-red-500 hover:bg-red-50"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    disabled={u.id === callerId}
                    onClick={() => setDeleteUser(u)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-xs text-slate-400">
        Signed in as {session?.user?.email}. Admins can manage accounts; staff accounts cannot see this page.
      </p>

      {/* Create */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add an account"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={(e) => void handleCreate(e as unknown as FormEvent)} loading={busy}>Create account</Button>
          </>
        }
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Field label="Username" htmlFor="ac-user" required hint="Lowercase letters, numbers, dots, dashes or underscores. This is what they type to sign in.">
            <Input
              id="ac-user" value={username} autoCapitalize="none" spellCheck={false}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="e.g. somchai"
            />
          </Field>
          <Field label="Display name" htmlFor="ac-name" hint="Shown inside the admin area.">
            <Input id="ac-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Somchai Jaidee" />
          </Field>
          <Field label="Password" htmlFor="ac-pass" required hint={`At least ${MIN_PASSWORD} characters. Give this to them directly; they can keep using it.`}>
            <div className="flex gap-2">
              <Input id="ac-pass" value={password} onChange={(e) => setPassword(e.target.value)} />
              <Button type="button" variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={() => setPassword(suggestPassword())} aria-label="Suggest another password" />
              <Button type="button" variant="outline" icon={<Copy className="h-4 w-4" />} onClick={() => copy(password, 'Password')} aria-label="Copy password" />
            </div>
          </Field>
          <Field label="Permission" htmlFor="ac-role" hint="Admins can manage accounts. Staff can create forms but cannot manage accounts.">
            <Select id="ac-role" value={role} onChange={(e) => setRole(e.target.value as 'owner' | 'staff')}>
              <option value="staff">Staff</option>
              <option value="owner">Admin</option>
            </Select>
          </Field>
        </form>
      </Modal>

      {/* Edit */}
      <Modal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        title={`Edit ${editUser?.username ?? ''}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={() => void handleSaveEdit()} loading={busy}>Save changes</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Display name">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </Field>
          {editUser?.is_username_account ? (
            <Field label="Username" hint="Changing this changes what they type to sign in.">
              <Input value={editUsername} autoCapitalize="none" spellCheck={false} onChange={(e) => setEditUsername(e.target.value.toLowerCase())} />
            </Field>
          ) : (
            <Field label="Sign in with" hint="This account signs in with an email address.">
              <Input value={editUser?.email ?? ''} readOnly />
            </Field>
          )}
          <Field label="Permission">
            <Select value={editRole} onChange={(e) => setEditRole(e.target.value as 'owner' | 'staff')}>
              <option value="staff">Staff</option>
              <option value="owner">Admin</option>
            </Select>
          </Field>
        </div>
      </Modal>

      {/* Password */}
      <Modal
        open={!!pwUser}
        onClose={() => setPwUser(null)}
        title={`Set a password for ${pwUser?.username ?? ''}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setPwUser(null)}>Cancel</Button>
            <Button onClick={() => void handleSetPassword()} loading={busy}>Set password</Button>
          </>
        }
      >
        <Field label="New password" required hint={`At least ${MIN_PASSWORD} characters. The old password stops working immediately.`}>
          <div className="flex gap-2">
            <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <Button type="button" variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={() => setNewPassword(suggestPassword())} aria-label="Suggest another password" />
            <Button type="button" variant="outline" icon={<Copy className="h-4 w-4" />} onClick={() => copy(newPassword, 'Password')} aria-label="Copy password" />
          </div>
        </Field>
      </Modal>

      <ConfirmDialog
        open={!!deleteUser}
        onClose={() => setDeleteUser(null)}
        onConfirm={() => void handleDelete()}
        title="Delete this account?"
        message={`"${deleteUser?.username}" will no longer be able to sign in. Events and registrations they created are not affected.`}
        confirmLabel="Delete account"
        danger
      />
    </div>
  );
}
