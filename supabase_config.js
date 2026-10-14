// ===========================================================
// SUPABASE CONNECTION
// This is the ONLY file where you paste your Supabase keys.
// Both the public gallery page and the admin page read from here.
//
// Where to find them: Supabase dashboard -> Settings -> API
// ===========================================================

// 1) Your Project URL, e.g. 'https://abcdxyz.supabase.co'
const SUPABASE_URL = 'https://dgaobndqlazcyiekmdvj.supabase.co';

// 2) The key labelled "anon public".
//    IMPORTANT: never paste the "service_role" key here. That one is a
//    master key and must never appear in website code.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnYW9ibmRxbGF6Y3lpZWttZHZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxMTE2MjMsImV4cCI6MjEwNDY4NzYyM30.ZC_jMCiCs6yXLZOlJCsWa_-cDfylnUd85uSUuBZLPvE';

// 3) The name of the Storage bucket you created for photos
const GALLERY_BUCKET = 'gallery-images';


// ---------- Nothing to edit below this line ----------
// Creates the connection. If the keys above are still empty,
// "sb" stays null and the pages show a friendly "not connected" message.
const sb = (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;