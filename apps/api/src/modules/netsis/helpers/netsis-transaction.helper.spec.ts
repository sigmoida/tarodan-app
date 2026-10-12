import {
  NetsisTransactionControl,
  runInNetsisTransaction,
} from "./netsis-transaction.helper";

describe("runInNetsisTransaction", () => {
  const makeControl = () => {
    const calls: string[] = [];
    const control: jest.Mocked<NetsisTransactionControl> = {
      open: jest.fn(async () => {
        calls.push("open");
        return "tx-1";
      }),
      commit: jest.fn(async (id: string) => {
        calls.push(`commit:${id}`);
      }),
      rollback: jest.fn(async (id: string) => {
        calls.push(`rollback:${id}`);
      }),
    };
    return { control, calls };
  };

  it("hands the transaction id to fn and commits on success", async () => {
    const { control, calls } = makeControl();
    const fn = jest.fn(async (tx: { transactionId: string }) => {
      calls.push(`fn:${tx.transactionId}`);
      return 42;
    });

    await expect(runInNetsisTransaction(control, fn)).resolves.toBe(42);
    expect(calls).toEqual(["open", "fn:tx-1", "commit:tx-1"]);
    expect(control.rollback).not.toHaveBeenCalled();
  });

  it("rolls back and rethrows fn's error", async () => {
    const { control, calls } = makeControl();
    const failure = new Error("line rejected");

    await expect(
      runInNetsisTransaction(control, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(calls).toEqual(["open", "rollback:tx-1"]);
  });

  it("keeps the original error when the rollback itself fails", async () => {
    const { control } = makeControl();
    const rollbackError = new Error("rollback failed");
    control.rollback.mockRejectedValueOnce(rollbackError);
    const onRollbackError = jest.fn();
    const failure = new Error("line rejected");

    await expect(
      runInNetsisTransaction(
        control,
        async () => {
          throw failure;
        },
        onRollbackError,
      ),
    ).rejects.toBe(failure);
    expect(onRollbackError).toHaveBeenCalledWith(rollbackError);
  });

  it("attempts a rollback when the commit fails, then rethrows the commit error", async () => {
    const { control, calls } = makeControl();
    const commitError = new Error("commit timeout");
    control.commit.mockRejectedValueOnce(commitError);

    await expect(
      runInNetsisTransaction(control, async () => "ok"),
    ).rejects.toBe(commitError);
    expect(calls).toEqual(["open", "rollback:tx-1"]);
  });

  it("never runs fn when the transaction cannot be opened", async () => {
    const { control } = makeControl();
    control.open.mockRejectedValueOnce(new Error("no licence"));
    const fn = jest.fn();

    await expect(runInNetsisTransaction(control, fn)).rejects.toThrow(
      "no licence",
    );
    expect(fn).not.toHaveBeenCalled();
  });
});
