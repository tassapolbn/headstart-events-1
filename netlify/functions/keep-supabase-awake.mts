/**
 * Keeps the Supabase project from being paused.
 *
 * On Supabase's Free plan, a project with about a week of very little database
 * activity is paused, and the app stops working until someone restores it in
 * the Supabase dashboard. A school holiday could do that. Three times a day
 * this asks the database one tiny question with the app's public key, which
 * counts as activity and costs almost nothing.
 *
 * It uses the site's own VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 * settings, which Netlify makes available to functions.
 */

declare const Netlify: { env: { get(name: string): string | undefined } };

export default async (): Promise<void> => {
  const url = Netlify.env.get('VITE_SUPABASE_URL');
  const key = Netlify.env.get('VITE_SUPABASE_ANON_KEY');
  if (!url || !key) {
    console.error('keep-supabase-awake: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing');
    return;
  }
  // The campus list: public, tiny, and read by every public page
  const response = await fetch(`${url}/rest/v1/campuses?select=id&limit=1`, { headers: { apikey: key } });
  if (response.ok) console.log('keep-supabase-awake: ok');
  else console.error(`keep-supabase-awake: Supabase answered ${response.status}`);
};

export const config = {
  // 00:17, 08:17 and 16:17 UTC, which is 07:17, 15:17 and 23:17 in Bangkok
  schedule: '17 0,8,16 * * *'
};
