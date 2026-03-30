import { CompoundIntelligence } from './index';
import { GeminiProvider } from './llm/gemini';
import { PostgresStorage } from './storage/postgres';
import { MemoryStorage } from './storage/memory';
import type { CIStorage } from './storage/interface';
import { ExperimentTracker } from '../experiments/tracker';

const globalForCI = globalThis as unknown as {
  ciStorage?: CIStorage;
  ciInstance?: CompoundIntelligence;
  ciGeminiKey?: string;
  ciTracker?: ExperimentTracker;
};

export function getStorage(): CIStorage {
  if (globalForCI.ciStorage) return globalForCI.ciStorage;
  const hasSupabase = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  globalForCI.ciStorage = hasSupabase ? new PostgresStorage() : new MemoryStorage();
  return globalForCI.ciStorage;
}

export function getCI(): CompoundIntelligence {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is required for CompoundIntelligence');

  // Recreate if key changed (user updated .env.local)
  if (globalForCI.ciInstance && globalForCI.ciGeminiKey === apiKey) {
    return globalForCI.ciInstance;
  }

  const storage = getStorage();
  const llm = new GeminiProvider(apiKey);
  globalForCI.ciInstance = new CompoundIntelligence({ llm, storage });
  globalForCI.ciGeminiKey = apiKey;
  return globalForCI.ciInstance;
}

export function getExperimentTracker(): ExperimentTracker {
  if (globalForCI.ciTracker) return globalForCI.ciTracker;
  globalForCI.ciTracker = new ExperimentTracker(getStorage());
  return globalForCI.ciTracker;
}
