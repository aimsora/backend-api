import { describe, expect, it, vi, afterEach } from "vitest";
import { SourceRunStatus } from "@prisma/client";
import { ScraperAdminService } from "./scraper-admin.service";

describe("ScraperAdminService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not mark a healthy active run as requiring attention", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          schedule: "*/20 * * * *",
          autoRunEnabled: true,
          running: true,
          runningSources: ["eis"],
          loadedSources: ["eis"],
          enabledSources: ["eis"],
          circuitStates: []
        })
      })
    );

    const prisma = {
      source: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([
          {
            code: "eis",
            name: "ЕИС / zakupki.gov.ru",
            isActive: true,
            runs: [
              {
                status: SourceRunStatus.RUNNING,
                startedAt: new Date(Date.now() - 30 * 60 * 1000)
              },
              {
                status: SourceRunStatus.SUCCESS,
                startedAt: new Date(Date.now() - 90 * 60 * 1000)
              }
            ]
          }
        ])
      },
      systemSetting: {
        findUnique: vi.fn().mockResolvedValue(null)
      },
      $transaction: vi.fn().mockImplementation(async (operations: Array<Promise<unknown>>) =>
        Promise.all(operations)
      )
    };
    const configService = {
      get: vi.fn((key: string) => {
        if (key === "SCRAPER_CONTROL_URL") {
          return "http://scraper-service:3001";
        }

        if (key === "SCRAPE_SCHEDULE") {
          return "*/20 * * * *";
        }

        if (key === "ENABLED_SOURCES") {
          return ["eis"];
        }

        return undefined;
      })
    };
    const analyticsService = {
      summary: vi.fn().mockResolvedValue({
        sourceHealth: [
          {
            source: "eis",
            riskLevel: "STABLE",
            successRate: 90,
            publicationRate: 100,
            failedRuns: 0,
            hoursSinceLastRun: 0
          }
        ]
      })
    };

    const service = new ScraperAdminService(
      prisma as never,
      configService as never,
      analyticsService as never
    );

    const overview = await service.getOverview();
    expect(overview.sources[0]).toMatchObject({
      sourceCode: "eis",
      isRunning: true,
      attentionRequired: false,
      attentionReason: "Источник сейчас выполняется"
    });
  });

  it("marks a suspiciously long active run as requiring attention", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          schedule: "*/20 * * * *",
          autoRunEnabled: true,
          running: true,
          runningSources: ["eis"],
          loadedSources: ["eis"],
          enabledSources: ["eis"],
          circuitStates: []
        })
      })
    );

    const prisma = {
      source: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([
          {
            code: "eis",
            name: "ЕИС / zakupki.gov.ru",
            isActive: true,
            runs: [
              {
                status: SourceRunStatus.RUNNING,
                startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000)
              },
              {
                status: SourceRunStatus.SUCCESS,
                startedAt: new Date(Date.now() - 5 * 60 * 60 * 1000)
              }
            ]
          }
        ])
      },
      systemSetting: {
        findUnique: vi.fn().mockResolvedValue(null)
      },
      $transaction: vi.fn().mockImplementation(async (operations: Array<Promise<unknown>>) =>
        Promise.all(operations)
      )
    };
    const configService = {
      get: vi.fn((key: string) => {
        if (key === "SCRAPER_CONTROL_URL") {
          return "http://scraper-service:3001";
        }

        if (key === "SCRAPE_SCHEDULE") {
          return "*/20 * * * *";
        }

        if (key === "ENABLED_SOURCES") {
          return ["eis"];
        }

        return undefined;
      })
    };
    const analyticsService = {
      summary: vi.fn().mockResolvedValue({
        sourceHealth: [
          {
            source: "eis",
            riskLevel: "STABLE",
            successRate: 90,
            publicationRate: 100,
            failedRuns: 0,
            hoursSinceLastRun: 3
          }
        ]
      })
    };

    const service = new ScraperAdminService(
      prisma as never,
      configService as never,
      analyticsService as never
    );

    const overview = await service.getOverview();
    expect(overview.sources[0]).toMatchObject({
      sourceCode: "eis",
      isRunning: true,
      attentionRequired: true,
      attentionReason: "Источник выполняется дольше ожидаемого и похож на зависший прогон"
    });
  });
});
