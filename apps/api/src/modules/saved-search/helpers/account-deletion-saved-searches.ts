import type { Prisma } from "@prisma/client";

/** The table the deletion step touches: the deletion transaction's `tx`. */
export type AccountDeletionSavedSearchesDb = Pick<
  Prisma.TransactionClient,
  "savedSearch"
>;

/**
 * Deletes the account's saved searches, inside the account-deletion
 * transaction. The user row is anonymised, not deleted, so the
 * `onDelete: Cascade` of the relation never fires; the search texts are the
 * user's own data and do not outlive the account.
 *
 * @returns how many searches were deleted
 */
export async function deleteSavedSearchesForAccountDeletion(
  tx: AccountDeletionSavedSearchesDb,
  userId: string,
): Promise<number> {
  const { count } = await tx.savedSearch.deleteMany({ where: { userId } });
  return count;
}
