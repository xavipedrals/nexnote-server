import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const XAI_API_KEY = process.env.XAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!SUPABASE_URL)
    throw new Error("SUPABASE_URL is required");
if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
}
if (!OPENAI_API_KEY)
    throw new Error("OPENAI_API_KEY is required");
if (!XAI_API_KEY)
    throw new Error("XAI_API_KEY is required");
if (!GEMINI_API_KEY)
    throw new Error("GEMINI_API_KEY is required");
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
export const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
export const xaiKey = XAI_API_KEY;
export const geminiKey = GEMINI_API_KEY;
// xAI Grok TTS voice IDs: eve, ara, rex, sal, leo.
// Defaults pick two distinct timbres for the two hosts; override per-deploy.
export const voices = {
    hostA: process.env.XAI_VOICE_HOST_A ?? "rex",
    hostB: process.env.XAI_VOICE_HOST_B ?? "eve",
};
//# sourceMappingURL=clients.js.map