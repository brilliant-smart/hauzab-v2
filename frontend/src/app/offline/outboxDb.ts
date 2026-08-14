import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CreateOrderPayload } from "@/app/api/types";

export type OutboxStatus = "pending" | "synced" | "failed";

/**
 * One queued sale. The uuid is generated once at sale confirmation and persisted
 * here BEFORE any network call, so a lost response + retry reuses the uuid and
 * the server's duplicate path returns the original order (no double stock charge).
 */
export interface OutboxEntry {
  uuid: string;
  payload: CreateOrderPayload;
  status: OutboxStatus;
  created_at: number;
  synced_at?: number;
  server_number?: string;
  server_id?: number;
  error?: string;
}

interface HauzabOutboxDB extends DBSchema {
  entries: {
    key: string;
    value: OutboxEntry;
    indexes: { by_status: OutboxStatus; by_created: number };
  };
}

const DB_NAME = "hauzab_outbox";
const STORE = "entries";

let dbPromise: Promise<IDBPDatabase<HauzabOutboxDB>> | null = null;

function db(): Promise<IDBPDatabase<HauzabOutboxDB>> {
  if (!dbPromise) {
    dbPromise = openDB<HauzabOutboxDB>(DB_NAME, 1, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: "uuid" });
        store.createIndex("by_status", "status");
        store.createIndex("by_created", "created_at");
      },
    });
  }
  return dbPromise;
}

export const outboxDb = {
  async add(entry: OutboxEntry): Promise<void> {
    await (await db()).put(STORE, entry);
  },
  async get(uuid: string): Promise<OutboxEntry | undefined> {
    return (await db()).get(STORE, uuid);
  },
  async all(): Promise<OutboxEntry[]> {
    return (await db()).getAll(STORE);
  },
  async pending(): Promise<OutboxEntry[]> {
    return (await db()).getAllFromIndex(STORE, "by_status", "pending");
  },
  async markSynced(uuid: string, patch: { server_id: number; server_number: string }): Promise<void> {
    const existing = await (await db()).get(STORE, uuid);
    if (!existing) return;
    await (await db()).put(STORE, {
      ...existing,
      status: "synced",
      synced_at: Date.now(),
      server_id: patch.server_id,
      server_number: patch.server_number,
      error: undefined,
    });
  },
  async markFailed(uuid: string, error: string): Promise<void> {
    const existing = await (await db()).get(STORE, uuid);
    if (!existing) return;
    await (await db()).put(STORE, { ...existing, status: "failed", error });
  },
  async remove(uuid: string): Promise<void> {
    await (await db()).delete(STORE, uuid);
  },
};