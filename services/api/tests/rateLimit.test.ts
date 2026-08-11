import { describe, it, expect } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { checkRateLimit } from "../src/lib/rateLimit.js";

describe("rate limiting", () => {
  it("allows requests up to the limit, then blocks within the window", async () => {
    const key = `test-${uuidv4()}`;
    const results: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(await checkRateLimit(key, 3, 60));
    }
    expect(results).toEqual([true, true, true, false, false]);
  });

  it("uses independent windows per key", async () => {
    const keyA = `test-${uuidv4()}`;
    const keyB = `test-${uuidv4()}`;
    for (let i = 0; i < 3; i++) await checkRateLimit(keyA, 3, 60);

    const stillAllowedForB = await checkRateLimit(keyB, 3, 60);
    expect(stillAllowedForB).toBe(true);
  });
});
