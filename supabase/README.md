# Supabase member setup

1. In the Supabase SQL Editor, run `migrations/20260918_member_data.sql` once.
2. In Authentication → Providers → Email, keep Email/Password enabled and enable **Confirm email**.
3. In Authentication → Email Templates → Confirm signup, keep the standard confirmation link based on `{{ .ConfirmationURL }}`. The member page automatically completes the sign-in after the visitor clicks that link.
4. In Authentication → URL Configuration, set the Site URL to `https://ai-supermall-preview.zhoushuo168.chatgpt.site` and add `https://ai-supermall-preview.zhoushuo168.chatgpt.site/account.html` as an allowed redirect URL.

The website needs only the Project URL and publishable key. The service-role/secret key must not be added to this project.

China-region account routing remains intentionally unavailable. Later, add a separate China provider through `CN_AUTH_URL` and `CN_AUTH_PUBLISHABLE_KEY`; do not point these at Supabase unless that deployment is intended for the China region.
