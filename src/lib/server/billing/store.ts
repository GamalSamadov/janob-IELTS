import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { parseRecord, type BillingRecord } from "./record";

/**
 * Where the billing record is kept: the user's Clerk `privateMetadata`. The app has no database
 * and the record is small, bounded and only ever read on the server, so this is enough — and
 * moving to a real database later means rewriting only these two functions.
 */

const KEY = "billing";

export async function readRecord(userId: string): Promise<BillingRecord> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return parseRecord((user.privateMetadata as Record<string, unknown> | undefined)?.[KEY]);
}

/**
 * Clerk has no compare-and-set, so writes are serialised per user inside this instance and the
 * whole record is read again under the lock. Two app instances writing for the same user in the
 * same instant can still lose one update; with usage that is one write per test and per
 * assessment, that is an acceptable rounding error rather than a correctness problem.
 */
const queues = new Map<string, Promise<unknown>>();

export function updateRecord(
  userId: string,
  mutate: (record: BillingRecord) => BillingRecord | null,
): Promise<BillingRecord> {
  const run = async (): Promise<BillingRecord> => {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadata = (user.privateMetadata ?? {}) as Record<string, unknown>;
    const current = parseRecord(metadata[KEY]);
    const next = mutate(current);
    if (!next) return current;
    // Replace rather than merge: a deep merge would keep holds that this update removed.
    await client.users.replaceUserMetadata(userId, {
      privateMetadata: { ...metadata, [KEY]: next as unknown as Record<string, unknown> },
    });
    return next;
  };

  const queued = (queues.get(userId) ?? Promise.resolve()).then(run, run);
  // The chain must survive a failed write, and the map must not grow forever.
  const tail = queued.then(
    () => {},
    () => {},
  );
  queues.set(userId, tail);
  void tail.then(() => {
    if (queues.get(userId) === tail) queues.delete(userId);
  });
  return queued;
}
