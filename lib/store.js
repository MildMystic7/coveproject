// World persistence: one JSON document in Supabase (table `world`), or a local file when Supabase isn't configured.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import path from 'node:path';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = URL && KEY ? createClient(URL, KEY, { auth: { persistSession: false } }) : null;
// Without Supabase the harbor lives in a file: .data/ locally, /tmp on Vercel (wiped whenever the function restarts).
const FILE = process.env.VERCEL ? '/tmp/cove-world.json' : path.join(process.cwd(), '.data', 'world.json');

export const persistent = () => !!supabase;

// Returns { data, version } or null when the world doesn't exist yet.
export async function load() {
  if (supabase) {
    const { data, error } = await supabase.from('world').select('data, version').eq('id', 1).maybeSingle();
    if (error) throw new Error(`Supabase load failed: ${error.message}`);
    return data ? { data: data.data, version: data.version } : null;
  }
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    return null;
  }
}

// Writes only if the stored version still matches `version`. Returns the new version, or null if someone else wrote first.
export async function save(data, version) {
  const next = version + 1;
  if (supabase) {
    if (version === 0) {
      const { error } = await supabase.from('world').insert({ id: 1, data, version: next });
      if (error) return null;
      return next;
    }
    const { data: rows, error } = await supabase.from('world')
      .update({ data, version: next, updated_at: new Date().toISOString() })
      .eq('id', 1).eq('version', version).select('version');
    if (error) throw new Error(`Supabase save failed: ${error.message}`);
    return rows && rows.length ? next : null;
  }
  const cur = await load();
  if ((cur ? cur.version : 0) !== version) return null;
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify({ data, version: next }));
  return next;
}
