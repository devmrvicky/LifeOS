const KEY = 'lifeos:local_user_id';

/**
 * Phase 1 has no auth UI yet (out of scope — see backlog). The app still
 * needs a stable `user_id` for every row so the schema and RLS-style
 * "users can only access their own records" rule already hold true once
 * real sign-in and Supabase sync are added later.
 */
export function getLocalUserId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
