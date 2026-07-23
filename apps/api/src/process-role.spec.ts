import { getProcessRole, runsQueueWorkers, servesHttp } from "./process-role";

describe("process-role (Faz 7.2)", () => {
  const prev = process.env.PROCESS_ROLE;
  afterEach(() => {
    if (prev === undefined) delete process.env.PROCESS_ROLE;
    else process.env.PROCESS_ROLE = prev;
  });

  it("varsayılan (env yok) → all (tek-process; HTTP + worker)", () => {
    delete process.env.PROCESS_ROLE;
    expect(getProcessRole()).toBe("all");
    expect(runsQueueWorkers()).toBe(true);
    expect(servesHttp()).toBe(true);
  });

  it("bilinmeyen değer güvenli varsayılana (all) düşer", () => {
    process.env.PROCESS_ROLE = "banana";
    expect(getProcessRole()).toBe("all");
  });

  it("web → HTTP evet, kuyruk worker'ları HAYIR (ayrı worker'a taşındı)", () => {
    process.env.PROCESS_ROLE = "web";
    expect(getProcessRole()).toBe("web");
    expect(servesHttp()).toBe(true);
    expect(runsQueueWorkers()).toBe(false);
  });

  it("worker → HTTP HAYIR (başsız), kuyruk worker'ları evet", () => {
    process.env.PROCESS_ROLE = "WORKER"; // case-insensitive
    expect(getProcessRole()).toBe("worker");
    expect(servesHttp()).toBe(false);
    expect(runsQueueWorkers()).toBe(true);
  });
});
