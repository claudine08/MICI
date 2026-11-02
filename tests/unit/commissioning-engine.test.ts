import { describe, expect, it } from "vitest";
import {
  nextCommissioningPlanStatus,
  availableCommissioningPlanActions,
  nextCommissioningItemStatus,
  availableCommissioningItemActions,
  nextAcceptanceStatus,
  availableAcceptanceActions,
} from "@/modules/commissioning/engine";

describe("commissioning engine", () => {
  it("plan: DRAFT -> ACTIVE -> COMPLETED", () => {
    expect(nextCommissioningPlanStatus("DRAFT", "ACTIVATE")).toBe("ACTIVE");
    expect(nextCommissioningPlanStatus("ACTIVE", "COMPLETE")).toBe("COMPLETED");
    expect(nextCommissioningPlanStatus("COMPLETED", "REOPEN")).toBe("ACTIVE");
  });
  it("plan: cancel requires from DRAFT/ACTIVE", () => {
    expect(nextCommissioningPlanStatus("DRAFT", "CANCEL")).toBe("CANCELLED");
    expect(nextCommissioningPlanStatus("COMPLETED", "CANCEL")).toBeNull();
  });
  it("item: full test/retest cycle", () => {
    expect(nextCommissioningItemStatus("PLANNED", "START")).toBe("IN_PROGRESS");
    expect(nextCommissioningItemStatus("IN_PROGRESS", "FAIL")).toBe("FAILED");
    expect(nextCommissioningItemStatus("FAILED", "RETEST")).toBe("RETESTING");
    expect(nextCommissioningItemStatus("RETESTING", "PASS")).toBe("PASSED");
    expect(nextCommissioningItemStatus("PASSED", "ACCEPT")).toBe("ACCEPTED");
  });
  it("item: available actions", () => {
    expect(availableCommissioningItemActions("PLANNED")).toContain("START");
    expect(availableCommissioningItemActions("ACCEPTED")).toContain("REOPEN");
  });
  it("acceptance: approve/reject/reopen", () => {
    expect(nextAcceptanceStatus("DRAFT", "APPROVE")).toBe("APPROVED");
    expect(nextAcceptanceStatus("DRAFT", "REJECT")).toBe("REJECTED");
    expect(nextAcceptanceStatus("APPROVED", "REOPEN")).toBe("DRAFT");
    expect(availableAcceptanceActions("REJECTED")).toContain("REOPEN");
  });
});