import { sql } from "./db.ts";
import { env } from "./env.ts";

// Letters live for RETENTION_DAYS, then are permanently removed (keeps a free
// deploy's storage bounded). Not surfaced anywhere in the UI. Reactions/reports
// are removed via ON DELETE CASCADE.
export function startRetention(): void {
  const days = env.RETENTION_DAYS;
  if (!Number.isFinite(days) || days <= 0) return;

  const sweep = async () => {
    try {
      const rows = await sql`
        DELETE FROM unspoken
        WHERE created_at < now() - make_interval(days => ${days})
        RETURNING id
      `;
      if (rows.length) {
        console.log(`[unspoken] retention: removed ${rows.length} expired letters`);
      }
    } catch (e) {
      console.error("[unspoken] retention sweep failed:", e);
    }
  };

  void sweep();
  setInterval(() => void sweep(), 6 * 60 * 60 * 1000).unref?.();
}
