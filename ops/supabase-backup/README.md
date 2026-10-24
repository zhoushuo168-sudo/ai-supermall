# AI Super Mall encrypted database backup
Manual workflow only. No schedule, website deployment, production migration, or production restore.
The source uses the confirmed Supabase Session Pooler on port 5432 and verified TLS.
The existing backup scripts create a consistent snapshot, custom pg_dump archive, roles without role passwords, and an encrypted manifest.
Only the age-encrypted archive is uploaded to the private R2 bucket and downloaded back for SHA-256 comparison.
The second job uses the separate backup-restore-validation environment for its age identity. It restores only into a newly initialized socket-only database.
A saved object is not a successful restore. Missing compatible Supabase extensions, role restrictions, or mismatched inventories fail verification.
Database backups do not include Storage/OSS file bytes, Cloudflare Secrets, OAuth client secrets, or external service settings.
The Mac recovery identity is kept outside Git under the owner's protected configuration directory; never copy it into this repository.
