## App-Level Supabase Folder

This folder exists to keep app-related migrations close to the Next.js codebase.

### Important

- The active Supabase CLI configuration is not here.
- The linked project currently uses the workspace-root folder:
  - `C:\Users\User\Desktop\Radar Smart - Vercel\supabase`

### Operational Rule

For database operations, run the CLI from the workspace root `supabase/` folder context.
Examples:

- `supabase db push`
- `supabase migration list --linked`

Keep migrations here aligned with the root `supabase/migrations` folder when adding new app features.
