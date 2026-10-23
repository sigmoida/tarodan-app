import { deleteSavedSearchesForAccountDeletion } from "./account-deletion-saved-searches";

/** Account deletion (KVKK): the user's saved searches do not outlive the account. */
describe("deleteSavedSearchesForAccountDeletion", () => {
  it("deletes only the user's searches and returns the count", async () => {
    const tx = {
      savedSearch: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
    };

    await expect(
      deleteSavedSearchesForAccountDeletion(tx as never, "user-1"),
    ).resolves.toBe(3);
    expect(tx.savedSearch.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });
});
