# FlexCord

Clean minimal friend group chat for GitHub Pages + Supabase.

## Setup

1. Create a Supabase project.
2. Run `supabase-schema.sql` in the SQL editor.
3. Create a public storage bucket called `avatars`.
4. Add a storage policy so public users can upload and read files in that bucket.
5. In `app.js`, paste your Supabase URL and anon key.
6. Upload the whole project to a GitHub repository and enable GitHub Pages.

## Important for profile picture upload

The profile picture upload now uses **Supabase Storage**.
Without the `avatars` bucket, the upload will fail.

### Create the bucket

Go to **Storage** in Supabase and create:
- Bucket name: `avatars`
- Public bucket: enabled

### Storage policies

In Supabase SQL editor, run something like this:

```sql
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Public can view avatars"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "Public can upload avatars"
on storage.objects for insert
with check (bucket_id = 'avatars');
```

If your project already has the bucket, only add the policies.

## Invite links

Use rooms like:
- `https://yourname.github.io/flexcord/?room=friends`
- `https://yourname.github.io/flexcord/?room=gym-group`

## Notes

- Messages stay after refresh because they are saved in Supabase.
- Calendar events are shared per room.
- Members are stored per room.
- If storage upload fails, the app falls back to the local preview image for the current browser session.
