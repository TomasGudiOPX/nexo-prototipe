import type { DatabaseSync } from "node:sqlite";
import { withDatabase } from "./database.server";

export type AssistantOwner = { ownerId: string; ownerName: string };

export type AssistantVisibility = {
  owners: Map<string, AssistantOwner>;
  sharedWith: Map<string, Set<string>>;
};

// NEXO records who created each assistant. RAGFlow cannot answer this: every
// request uses the same service key, so all chats share one tenant and expose
// no per-user author. Assistants created before this table existed, or directly
// in RAGFlow, simply have no owner and count as shared.
export function recordAssistantOwner(assistantId: string, ownerId: string) {
  if (!assistantId || !ownerId) return;
  withDatabase(db => db.prepare("INSERT INTO assistant_owners(assistant_id,owner_id) VALUES(?,?) ON CONFLICT(assistant_id) DO UPDATE SET owner_id=excluded.owner_id").run(assistantId, ownerId));
}

// Build the visibility tables from an already open handle so callers that
// resolve a whole workspace list do not pay for a second connection.
export function assistantVisibility(db: DatabaseSync): AssistantVisibility {
  const owners = new Map<string, AssistantOwner>();
  for (const row of db.prepare("SELECT o.assistant_id AS assistantId, u.id AS ownerId, u.display_name AS ownerName FROM assistant_owners o JOIN users u ON u.id=o.owner_id").all() as Record<string, unknown>[]) {
    owners.set(String(row.assistantId), { ownerId: String(row.ownerId), ownerName: String(row.ownerName) });
  }
  const sharedWith = new Map<string, Set<string>>();
  for (const row of db.prepare("SELECT assistant_id AS assistantId, user_id AS userId FROM assistant_shares").all() as Record<string, unknown>[]) {
    const key = String(row.assistantId);
    const target = sharedWith.get(key);
    if (target) target.add(String(row.userId)); else sharedWith.set(key, new Set([String(row.userId)]));
  }
  return { owners, sharedWith };
}

export function assistantVisibilitySnapshot() {
  return withDatabase(db => assistantVisibility(db));
}

// An assistant with no recorded author stays visible to every member of the
// workspace. Once an author is recorded, only that author, the users they
// shared it with, and site administrators can use it.
export function assistantAccessFor(visibility: AssistantVisibility, assistantId: string, user: { id: string; role: string }) {
  const owner = visibility.owners.get(assistantId);
  const mine = Boolean(owner && owner.ownerId === user.id);
  const sharedWithMe = visibility.sharedWith.get(assistantId)?.has(user.id) ?? false;
  return {
    ownerId: owner?.ownerId ?? "",
    ownerName: owner?.ownerName ?? "",
    mine,
    sharedWithMe,
    visible: user.role === "site-admin" || !owner || mine || sharedWithMe,
  };
}

export function setAssistantShares(assistantId: string, userIds: string[]) {
  withDatabase(db => {
    db.prepare("DELETE FROM assistant_shares WHERE assistant_id=?").run(assistantId);
    const insert = db.prepare("INSERT OR IGNORE INTO assistant_shares(assistant_id,user_id) VALUES(?,?)");
    for (const userId of new Set(userIds)) insert.run(assistantId, userId);
  });
}
