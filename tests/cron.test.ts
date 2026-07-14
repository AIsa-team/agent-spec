import { describe, it, expect } from "vitest";
import { parseCronJobs } from "../src/schema/cron.js";

describe("parseCronJobs", () => {
  it("parses jobs with defaults (model=null, deliver=origin, enabled=true)", () => {
    const jobs = parseCronJobs(`
jobs:
  - id: portfolio-push
    schedule: "0 10 * * 1-5"
    prompt: |
      run the valuation push
  - id: pm-daily
    schedule: "5 18 * * 1-5"
    prompt: daily decisions
    model: default
    enabled: false
`);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      id: "portfolio-push", model: null, deliver: "origin", enabled: true,
    });
    expect(jobs[1].model).toBe("default");
    expect(jobs[1].enabled).toBe(false);
  });

  it("rejects invalid cron expression (must have 5 fields)", () => {
    expect(() => parseCronJobs(`
jobs:
  - id: bad
    schedule: "every day"
    prompt: p
`)).toThrow(/schedule/);
  });

  it("rejects duplicate job ids", () => {
    expect(() => parseCronJobs(`
jobs:
  - { id: a, schedule: "0 0 * * *", prompt: p }
  - { id: a, schedule: "1 0 * * *", prompt: q }
`)).toThrow(/duplicate/i);
  });
});
