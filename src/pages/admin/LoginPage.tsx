import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/basics';
import { Field, Input } from '@/components/ui/inputs';
import { supabaseConfigured } from '@/lib/supabase';

export default function LoginPage() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) return <Navigate to="/admin" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signIn(email.trim(), password);
    setBusy(false);
    if (result.error) {
      setError('Sign in failed. Please check your email and password.');
    } else {
      const from = (location.state as { from?: string } | null)?.from ?? '/admin';
      navigate(from, { replace: true });
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy-800 via-navy-700 to-navy-900 p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl"
      >
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src="/logo.svg" alt="HeadStart logo" className="h-14 w-14" />
          <div>
            <h1 className="font-display text-xl font-bold text-navy-800">HeadStart Events</h1>
            <p className="text-sm text-slate-500">Administrator sign in</p>
          </div>
        </div>

        {!supabaseConfigured && (
          <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
            Supabase is not configured yet. Copy .env.example to .env and add your project keys, then restart.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Email address" htmlFor="login-email" required>
            <Input
              id="login-email" type="email" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="events@headstartphuket.com"
            />
          </Field>
          <Field label="Password" htmlFor="login-password" required error={error ?? undefined}>
            <Input
              id="login-password" type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={busy} icon={<Lock className="h-4 w-4" />}>
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Accounts are created by the administrator in the Supabase dashboard. Public visitors do not need an account.
        </p>
      </motion.div>
    </main>
  );
}
