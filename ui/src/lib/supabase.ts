import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tdqxalooulryandvxkpx.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _client: SupabaseClient | null = null;

/** Lazy-loaded Supabase client. Never crashes at import time. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
    get(_target, prop) {
        if (!_client) {
            if (!supabaseServiceKey) {
                throw new Error(
                    '[SUPABASE] SUPABASE_SERVICE_ROLE_KEY is not set. ' +
                    'Add it to .env.local or set STORAGE_MODE=mock to skip Postgres.'
                );
            }
            _client = createClient(supabaseUrl, supabaseServiceKey);
        }
        return (_client as any)[prop];
    },
});
