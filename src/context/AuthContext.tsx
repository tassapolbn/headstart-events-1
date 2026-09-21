import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthValue {
  session: Session | null;
  loading: boolean;
  /** 'owner' accounts may manage staff accounts. Legacy accounts have no role yet. */
  role: 'owner' | 'staff' | null;
  isOwner: boolean;
  displayName: string;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  session: null,
  loading: true,
  role: null,
  isOwner: false,
  displayName: '',
  signIn: async () => ({}),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const meta = session?.user?.user_metadata ?? {};
  const rawRole = (session?.user?.app_metadata as { role?: string } | undefined)?.role;
  const role = rawRole === 'owner' ? 'owner' : rawRole === 'staff' ? 'staff' : null;
  // Accounts created before roles existed have no role: they keep owner access
  // until the first owner is confirmed, so nobody is ever locked out.
  const isOwner = role === 'owner' || role === null;
  const displayName = String(meta.display_name || meta.username || session?.user?.email || '');

  return (
    <AuthContext.Provider value={{ session, loading, role, isOwner, displayName, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
