import { describe, it, expect } from "vitest";
import { registerAdapter, getAdapter } from "../src/adapters/adapter.js";

describe("adapter registry", () => {
  it("registers and retrieves by target name", () => {
    const fake = { target: "fake", build: async () => ({ outDir: "x", files: [] }) };
    registerAdapter(fake);
    expect(getAdapter("fake")).toBe(fake);
  });

  it("unknown target throws and lists available ones", () => {
    expect(() => getAdapter("openclaw")).toThrow(/openclaw.*available/i);
  });
});
