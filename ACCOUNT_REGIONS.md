# Account-region foundation

AI SuperMall keeps the member experience independent from the account provider.

- `/api/account/bootstrap` returns only a region hint and whether the account service is ready. It never exposes a provider name or secret.
- The global account service is reserved for Supabase through `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
- The China account service is reserved for a future domestic provider through `CN_AUTH_URL` and `CN_AUTH_PUBLISHABLE_KEY`.
- A member record must remain in the region where the account was created. Do not copy passwords, verification codes, or private project content across regions.
- Later account routes must use the selected region server-side, then expose the same AI SuperMall account flow to the browser.
