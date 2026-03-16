import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tdqxalooulryandvxkpx.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseServiceKey) {
  console.warn('[SUPABASE] No SUPABASE_SERVICE_ROLE_KEY set - Postgres adapter will not work');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
