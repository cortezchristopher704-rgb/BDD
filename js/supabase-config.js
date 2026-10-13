// Conexión al proyecto de Supabase "BDD 3RA"
const SUPABASE_URL = 'https://xpxgvucjeepmxalpyszh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhweGd2dWNqZWVwbXhhbHB5c3poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxODgxODEsImV4cCI6MjEwNDc2NDE4MX0.ooGFZkcpShx5fJTE7inWmRZFW8bzYKGm6UqLOmQTF-A';

// window.supabase viene de la librería que se carga en el <script> del HTML
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
