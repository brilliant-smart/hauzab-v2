import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AxiosError } from "axios";
import { outboxDb } from "./outboxDb";
import { useOutbox, OUTBOX_ADDED_EVENT } from "./useOutbox";
import { outboxApi, OutboxAuthError } from "@/app/lib/outboxApi";
import { tokenStorage } from "@/app/auth/token";
import { orderKeys } from "@/app/api/orders";
import type { Order } from "@/app/api/types";

interface SyncContextValue {
  online: boolean;
  pendingCount: number;
  draining: boolean;
  lastSyncedAt: number | null;
}

const SyncContext = createContext<SyncContextValue>({
  online: typeof navigator !== "undefined" ? navigator.onLine : true,
  pendingCount: 0,
  draining: false,
  lastSyncedAt: null,
});

export function useSync(): SyncContextValue {
  return useContext(SyncContext);
}

/**
 * Mounted once at the app root. Drains the IndexedDB outbox to the campus
 * server whenever connectivity returns (online event, tab focus, a 30s tick, or
 * a new outbox row). Each row POSTs through the idempotent uuid contract, so a
 * retried push never double-charges. 401s throw instead of redirecting so a
 * background sync never abandons a cashier mid-sale.
 */
export function SyncManager({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { pendingCount } = useOutbox();
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [draining, setDraining] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const drainingRef = useRef(false);

  const drain = useCallback(async () => {
    if (drainingRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (!tokenStorage.get()) return;

    drainingRef.current = true;
    setDraining(true);
    try {
      const entries = await outboxDb.pending();
      for (const entry of entries) {
        if (typeof navigator !== "undefined" && !navigator.onLine) break;

        try {
          const res = await outboxApi.post<{ data: Order }>("orders", entry.payload);
          const order = res.data.data;
          await outboxDb.markSynced(entry.uuid, {
            server_id: order.id,
            server_number: order.number,
          });
          qc.invalidateQueries({ queryKey: orderKeys.all });
          qc.invalidateQueries({ queryKey: ["products"] });
          qc.invalidateQueries({ queryKey: ["outbox"] });
          toast.success(`Synced ${order.number}`);
        } catch (err) {
          if (err instanceof OutboxAuthError) {
            toast.error("Re-login required to sync pending sales");
            break;
          }
          if (err instanceof AxiosError && err.response) {
            const status = err.response.status;
            const msg = (err.response.data as { message?: string } | undefined)?.message;
            if (status === 422) {
              // Real validation rejection (e.g. insufficient stock) — not retriable.
              await outboxDb.markFailed(entry.uuid, msg ?? "Rejected by server");
              toast.error(`Pending sale rejected: ${msg ?? "validation error"}`);
            } else if (status >= 500) {
              // Server fault — leave pending and retry next cycle.
              break;
            } else {
              // Other 4xx — not auto-recoverable; park it for manual review.
              await outboxDb.markFailed(entry.uuid, msg ?? `HTTP ${status}`);
            }
          } else {
            // No response (network down / timeout) — leave pending, retry next cycle.
            break;
          }
        }
      }
      setLastSyncedAt(Date.now());
    } finally {
      drainingRef.current = false;
      setDraining(false);
    }
  }, [qc]);

  // Track connectivity and drain the moment it returns.
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      drain();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [drain]);

  // Drain on focus, on a 30s tick, and shortly after a new row is added.
  // The add-event drain is debounced so a cashier's own online POST (in
  // MakeSale) resolves and marks the row synced before the drainer re-POSTs;
  // the server's uuid idempotency makes any overlap harmless regardless.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") drain();
    };
    let addTimer: number | undefined;
    const onAdded = () => {
      if (addTimer) window.clearTimeout(addTimer);
      addTimer = window.setTimeout(drain, 800);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(OUTBOX_ADDED_EVENT, onAdded);
    const interval = window.setInterval(drain, 30000);
    drain(); // catch leftover pending entries on mount
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(OUTBOX_ADDED_EVENT, onAdded);
      window.clearInterval(interval);
      if (addTimer) window.clearTimeout(addTimer);
    };
  }, [drain]);

  return (
    <SyncContext.Provider value={{ online, pendingCount, draining, lastSyncedAt }}>
      {children}
    </SyncContext.Provider>
  );
}