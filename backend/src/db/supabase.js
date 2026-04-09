import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios');
}

// Singleton com service_role — bypassa RLS no backend
// NUNCA expor este cliente ao frontend
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: { persistSession: false },
  }
);

export default supabase;
