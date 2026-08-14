import { useQuery, useQueryClient } from "@tanstack/react-query";
import { outboxDb, type OutboxEntry } from "./outboxDb";

export const outboxKeys = {
  all: ["outbox"] as const,
  pending: ["outbox", "pending"] as const,
  allEntries: ["outbox", "all"] as const,
};

/** Custom event fired when a new outbox row is added, so the SyncManager drains immediately. */
export const OUTBOX_ADDED_EVENT = "hauzab:outbox-added";

/**
 * Single React gateway to the IndexedDB outbox. All reads/writes flow through
 * here so the query cache stays consistent and the SyncManager gets notified.
 */
export function useOutbox() {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: outboxKeys.all });
  };

  const pendingQuery = useQuery({
    queryKey: outboxKeys.pending,
    queryFn: () => outboxDb.pending(),
  });
  const allQuery = useQuery({
    queryKey: outboxKeys.allEntries,
    queryFn: () => outboxDb.all(),
  });

  const add = async (entry: OutboxEntry): Promise<void> => {
    await outboxDb.add(entry);
    invalidate();
    window.dispatchEvent(new CustomEvent(OUTBOX_ADDED_EVENT));
  };

  const markSynced = async (uuid: string, patch: { server_id: number; server_number: string }): Promise<void> => {
    await outboxDb.markSynced(uuid, patch);
    invalidate();
  };

  const markFailed = async (uuid: string, error: string): Promise<void> => {
    await outboxDb.markFailed(uuid, error);
    invalidate();
  };

  const remove = async (uuid: string): Promise<void> => {
    await outboxDb.remove(uuid);
    invalidate();
  };

  return {
    pending: pendingQuery.data ?? [],
    all: allQuery.data ?? [],
    pendingCount: pendingQuery.data?.length ?? 0,
    add,
    markSynced,
    markFailed,
    remove,
  };
}