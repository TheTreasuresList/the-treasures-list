import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wxuntofnbyrgcnsdzlyq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4dW50b2ZuYnlyZ2Nuc2R6bHlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNjIyNzQsImV4cCI6MjA5ODgzODI3NH0.oJ1QcLij41ziY_5AxTeTTVQWRejGKRFK38c6bj9n8vw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const COLS = 'id, name, type, category, city, state, country, address, phone, website, map_url, description, instagram, tiktok, youtube, twitter, featured, slug';
const PAGE_SIZE = 1000;

function mapRow(r) {
  return {
    id:       r.id,
    name:     r.name,
    type:     r.type,
    category: r.category,
    city:     r.city        || '',
    state:    r.state       || '',
    country:  r.country     || '',
    address:  r.address     || '',
    phone:    r.phone       || '',
    website:  r.website     || '',
    mapUrl:   r.map_url     || '',
    desc:     r.description || '',
    socials: {
      ...(r.instagram ? { instagram: r.instagram } : {}),
      ...(r.tiktok    ? { tiktok:    r.tiktok    } : {}),
      ...(r.youtube   ? { youtube:   r.youtube   } : {}),
      ...(r.twitter   ? { twitter:   r.twitter   } : {}),
    },
    featured: r.featured || false,
    slug:     r.slug     || '',
  };
}

// ── Public: fetch all approved listings ──────────────────────────────────────
export async function fetchListings() {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('listings')
      .select(COLS)
      .eq('status', 'approved')
      .order('name')
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error('[Supabase] fetchListings error:', error.message);
      return all.length > 0 ? all : null;
    }
    all.push(...data.map(mapRow));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error };
  return { user: data.user, error: null };
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

// ── Admin: update a listing ───────────────────────────────────────────────────
export async function adminUpdateListing(id, updates) {
  const { error } = await supabase.from('listings').update(updates).eq('id', id);
  return { error };
}

// ── Admin: fetch submissions ──────────────────────────────────────────────────
export async function adminFetchSubmissions() {
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .order('created_at', { ascending: false });
  return { data: data || [], error };
}

// ── Admin: update submission status ──────────────────────────────────────────
export async function adminUpdateSubmission(id, status) {
  const { error } = await supabase.from('submissions').update({ status }).eq('id', id);
  return { error };
}
