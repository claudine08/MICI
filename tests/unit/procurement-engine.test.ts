import { describe, expect, it } from "vitest";
import {
  analyzeBidComparison,
  calculateQuotationTotals,
  isPurchaseRequestEditable,
  isPurchaseRequestOpen,
  isPurchaseRequestOverdue,
  isQuotationEditable,
  isSupplierActive,
  nextPurchaseRequestStatus,
  nextQuotationStatus,
  summarizeProcurementBoard,
} from "@/modules/procurement/engine";

describe("Procurement Engine (E14)", () => {
  describe("Supplier checks", () => {
    it("identifies active suppliers", () => {
      expect(isSupplierActive("ACTIVE")).toBe(true);
      expect(isSupplierActive("BLOCKED")).toBe(false);
      expect(isSupplierActive("INACTIVE")).toBe(false);
    });
  });

  describe("PurchaseRequest state machine", () => {
    it("SUBMIT allows DRAFT to SUBMITTED only with items", () => {
      const errNoItems = nextPurchaseRequestStatus({
        currentStatus: "DRAFT",
        action: "SUBMIT",
        itemCount: 0,
      });
      expect("error" in errNoItems).toBe(true);

      const ok = nextPurchaseRequestStatus({
        currentStatus: "DRAFT",
        action: "SUBMIT",
        itemCount: 2,
      });
      expect(ok).toEqual({ nextStatus: "SUBMITTED" });
    });

    it("START_QUOTING transitions SUBMITTED to QUOTING", () => {
      const res = nextPurchaseRequestStatus({
        currentStatus: "SUBMITTED",
        action: "START_QUOTING",
      });
      expect(res).toEqual({ nextStatus: "QUOTING" });
    });

    it("FINISH_QUOTING requires at least 1 quotation", () => {
      const noQuotations = nextPurchaseRequestStatus({
        currentStatus: "QUOTING",
        action: "FINISH_QUOTING",
        quotationCount: 0,
      });
      expect("error" in noQuotations).toBe(true);

      const withQuotations = nextPurchaseRequestStatus({
        currentStatus: "QUOTING",
        action: "FINISH_QUOTING",
        quotationCount: 2,
      });
      expect(withQuotations).toEqual({ nextStatus: "COMPARED" });
    });

    it("APPROVE transitions COMPARED or SUBMITTED to APPROVED", () => {
      const res1 = nextPurchaseRequestStatus({
        currentStatus: "COMPARED",
        action: "APPROVE",
        hasSelectedQuotation: true,
      });
      expect(res1).toEqual({ nextStatus: "APPROVED" });

      const resFail = nextPurchaseRequestStatus({
        currentStatus: "COMPARED",
        action: "APPROVE",
        hasSelectedQuotation: false,
      });
      expect("error" in resFail).toBe(true);

      const res2 = nextPurchaseRequestStatus({
        currentStatus: "SUBMITTED",
        action: "APPROVE",
      });
      expect(res2).toEqual({ nextStatus: "APPROVED" });
    });

    it("CANCEL and REOPEN lifecycle", () => {
      const cancel = nextPurchaseRequestStatus({
        currentStatus: "QUOTING",
        action: "CANCEL",
      });
      expect(cancel).toEqual({ nextStatus: "CANCELLED" });

      const reopen = nextPurchaseRequestStatus({
        currentStatus: "CANCELLED",
        action: "REOPEN",
      });
      expect(reopen).toEqual({ nextStatus: "DRAFT" });

      const approvedCancel = nextPurchaseRequestStatus({
        currentStatus: "APPROVED",
        action: "CANCEL",
      });
      expect("error" in approvedCancel).toBe(true);
    });

    it("isPurchaseRequestEditable and isOpen checks", () => {
      expect(isPurchaseRequestEditable("DRAFT")).toBe(true);
      expect(isPurchaseRequestEditable("SUBMITTED")).toBe(true);
      expect(isPurchaseRequestEditable("QUOTING")).toBe(false);
      expect(isPurchaseRequestEditable("APPROVED")).toBe(false);

      expect(isPurchaseRequestOpen("DRAFT")).toBe(true);
      expect(isPurchaseRequestOpen("QUOTING")).toBe(true);
      expect(isPurchaseRequestOpen("APPROVED")).toBe(false);
      expect(isPurchaseRequestOpen("CANCELLED")).toBe(false);
    });

    it("isPurchaseRequestOverdue handles dates correctly", () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

      expect(isPurchaseRequestOverdue(yesterday, "SUBMITTED")).toBe(true);
      expect(isPurchaseRequestOverdue(tomorrow, "SUBMITTED")).toBe(false);
      expect(isPurchaseRequestOverdue(yesterday, "APPROVED")).toBe(false); // Closed requests are not overdue
    });
  });

  describe("Quotation calculation & state machine", () => {
    it("calculates items total, shipping and discount", () => {
      const items = [
        { quantity: 10, unitPrice: 25.5 }, // 255.00
        { quantity: 2, unitPrice: 100 },   // 200.00
      ];
      const result = calculateQuotationTotals(items, 50, 15);
      expect(result.itemsTotal).toBe(455);
      expect(result.totalAmount).toBe(490);
    });

    it("nextQuotationStatus lifecycle", () => {
      expect(isQuotationEditable("DRAFT")).toBe(true);
      expect(isQuotationEditable("SUBMITTED")).toBe(false);

      const submit = nextQuotationStatus("DRAFT", "SUBMIT", 1);
      expect(submit).toEqual({ nextStatus: "SUBMITTED" });

      const select = nextQuotationStatus("SUBMITTED", "SELECT");
      expect(select).toEqual({ nextStatus: "SELECTED" });

      const reopen = nextQuotationStatus("CANCELLED", "REOPEN");
      expect(reopen).toEqual({ nextStatus: "DRAFT" });
    });
  });

  describe("Bid comparison analysis", () => {
    it("sorts by price, calculates difference percentage, and identifies lowest price", () => {
      const quotations = [
        {
          quotationId: "q1",
          quotationCode: "QT001",
          supplierId: "s1",
          supplierName: "Fornecedor Alpha",
          totalAmount: 1000,
          leadTimeDays: 10,
          status: "SUBMITTED" as const,
        },
        {
          quotationId: "q2",
          quotationCode: "QT002",
          supplierId: "s2",
          supplierName: "Fornecedor Beta",
          totalAmount: 1200,
          leadTimeDays: 5,
          status: "SUBMITTED" as const,
        },
        {
          quotationId: "q3",
          quotationCode: "QT003",
          supplierId: "s3",
          supplierName: "Fornecedor Gamma",
          totalAmount: 900,
          leadTimeDays: 15,
          status: "SUBMITTED" as const,
        },
      ];

      const analysis = analyzeBidComparison(quotations);
      expect(analysis.quotationCount).toBe(3);
      expect(analysis.lowestPriceQuotationId).toBe("q3");
      expect(analysis.lowestPrice).toBe(900);
      expect(analysis.fastestLeadTimeQuotationId).toBe("q2");
      expect(analysis.fastestLeadTimeDays).toBe(5);

      expect(analysis.entries[0].quotationId).toBe("q3");
      expect(analysis.entries[0].priceRank).toBe(1);
      expect(analysis.entries[0].differenceFromLowestPercent).toBe(0);
      expect(analysis.entries[0].isLowestPrice).toBe(true);

      expect(analysis.entries[1].quotationId).toBe("q1");
      expect(analysis.entries[1].priceRank).toBe(2);
      expect(analysis.entries[1].differenceFromLowestPercent).toBe(11.1); // (1000 - 900)/900 = 11.1%
    });
  });

  describe("Board summary", () => {
    it("summarizes counts accurately", () => {
      const summary = summarizeProcurementBoard(
        [
          { status: "DRAFT" },
          { status: "SUBMITTED" },
          { status: "QUOTING" },
          { status: "COMPARED" },
          { status: "APPROVED" },
        ],
        [
          { status: "DRAFT" },
          { status: "SUBMITTED" },
          { status: "SELECTED" },
        ],
        [
          { status: "ACTIVE" },
          { status: "ACTIVE" },
          { status: "BLOCKED" },
        ]
      );

      expect(summary.totalRequests).toBe(5);
      expect(summary.openRequests).toBe(2); // DRAFT + SUBMITTED
      expect(summary.quotingRequests).toBe(1);
      expect(summary.comparedRequests).toBe(1);
      expect(summary.approvedRequests).toBe(1);
      expect(summary.totalQuotations).toBe(3);
      expect(summary.selectedQuotations).toBe(1);
      expect(summary.totalSuppliers).toBe(3);
      expect(summary.activeSuppliers).toBe(2);
    });
  });
});

