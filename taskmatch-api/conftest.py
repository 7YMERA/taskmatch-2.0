"""Shared test setup: dummy env so main.py imports without real Supabase creds.
Loaded by pytest before any test module, so these apply whichever file imports main first."""
import os

os.environ.setdefault("SUPABASE_URL", "https://test.local")
os.environ.setdefault("SUPABASE_KEY", "test-key")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
