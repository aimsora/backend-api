import { BadGatewayException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SourceRunStatus } from "@prisma/client";
import { AnalyticsService } from "../analytics/analytics.service";
import { PrismaService } from "../prisma/prisma.service";
import type {
  ScraperAdminConfig,
  ScraperAdminOverview,
  ScraperRuntimeState,
  UpdateScraperAdminSourceStateInput,
  UpdateScraperAdminConfigInput
} from "./scraper-admin.models";

const SCRAPER_CONFIG_KEY = "scraper.runtime.config";
const RUNNING_ATTENTION_THRESHOLD_MS = 2 * 60 * 60 * 1000;

type RuntimeConfigRecord = {
  schedule: string;
  autoRunEnabled: boolean;
  enabledSources: string[];
};

@Injectable()
export class ScraperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly analyticsService: AnalyticsService
  ) {}

  async getOverview(): Promise<ScraperAdminOverview> {
    const config = await this.getCurrentConfig();
    await this.syncSourceActivation(config.enabledSources);

    const [runtime, analytics, sources] = await Promise.all([
      this.fetchRuntimeState(config),
      this.analyticsService.summary(),
      this.prisma.source.findMany({
        where: { deletedAt: null },
        orderBy: { code: "asc" },
        include: {
          runs: {
            take: 5,
            orderBy: { startedAt: "desc" }
          }
        }
      })
    ]);

    const analyticsBySource = new Map(analytics.sourceHealth.map((item) => [item.source, item]));
    const runtimeRunning = new Set(runtime.runningSources);
    const circuitBySource = new Map(runtime.circuitStates.map((item) => [item.sourceCode, item]));
    const loadedSourceCodes = new Set(runtime.loadedSources);

    return {
      config,
      runtime,
      sources: sources.map((source) => {
        const now = Date.now();
        const health = analyticsBySource.get(source.code);
        const lastRun = source.runs[0];
        const lastSuccess = source.runs.find((item) => item.status === SourceRunStatus.SUCCESS);
        const circuitState = circuitBySource.get(source.code);
        const isRunning = runtimeRunning.has(source.code);
        const isLoaded = loadedSourceCodes.has(source.code);
        const circuitOpen = Boolean(
          circuitState?.openUntil && circuitState.openUntil.getTime() > Date.now()
        );
        const hasStaleRunningStatus =
          lastRun?.status === SourceRunStatus.RUNNING && !isRunning;
        const runningTooLong = Boolean(
          isRunning &&
            lastRun?.startedAt &&
            now - lastRun.startedAt.getTime() >= RUNNING_ATTENTION_THRESHOLD_MS
        );

        let attentionReason = "Работает стабильно";

        if (!source.isActive) {
          attentionReason = "Источник исключён из сбора администратором";
        } else if (!isLoaded) {
          attentionReason = "Источник не загружен в текущий runtime scraper-service";
        } else if (!runtime.reachable) {
          attentionReason = "Контур управления scraper-service недоступен";
        } else if (circuitOpen) {
          attentionReason = "Circuit breaker открыт после серии ошибок";
        } else if (runningTooLong) {
          attentionReason = "Источник выполняется дольше ожидаемого и похож на зависший прогон";
        } else if (hasStaleRunningStatus) {
          attentionReason = "В БД остался статус RUNNING, но scraper-service не подтверждает активный прогон";
        } else if (!lastRun) {
          attentionReason = "Запусков ещё не было";
        } else if (
          lastRun.status === SourceRunStatus.FAILED ||
          lastRun.status === SourceRunStatus.PARTIAL
        ) {
          attentionReason = lastRun.errorMessage || "Последний запуск завершился с ошибкой";
        } else if ((health?.riskLevel ?? "STABLE") !== "STABLE") {
          attentionReason =
            (health?.failedRuns ?? 0) > 0
              ? `${health?.failedRuns ?? 0} неуспешных или частичных запусков в недавнем окне при текущем успешном прогоне`
              : "Источник отмечен как требующий внимания";
        } else if (isRunning) {
          attentionReason = "Источник сейчас выполняется";
        }

        return {
          sourceCode: source.code,
          sourceName: source.name,
          isActive: source.isActive,
          isLoaded,
          lastRunStatus: lastRun?.status ?? null,
          lastRunAt: lastRun?.startedAt ?? null,
          lastSuccessAt: lastSuccess?.startedAt ?? null,
          lastErrorMessage: lastRun?.errorMessage ?? undefined,
          riskLevel: health?.riskLevel ?? "STABLE",
          successRate: health?.successRate ?? 0,
          publicationRate: health?.publicationRate ?? 0,
          failedRuns: health?.failedRuns ?? 0,
          hoursSinceLastRun: health?.hoursSinceLastRun ?? null,
          isRunning,
          circuitOpen,
          consecutiveFailures: circuitState?.failures ?? 0,
          circuitOpenUntil: circuitState?.openUntil ?? null,
          attentionRequired:
            source.isActive &&
            (!isLoaded ||
            !runtime.reachable ||
            !lastRun ||
            runningTooLong ||
            hasStaleRunningStatus ||
            circuitOpen ||
            lastRun.status === SourceRunStatus.FAILED ||
            lastRun.status === SourceRunStatus.PARTIAL ||
            (health?.riskLevel ?? "STABLE") !== "STABLE"),
          attentionReason
        };
      })
    };
  }

  async updateConfig(input: UpdateScraperAdminConfigInput): Promise<ScraperAdminConfig> {
    const currentConfig = await this.getCurrentConfig();
    const nextConfig = this.normalizeConfig({
      ...currentConfig,
      schedule: input.schedule,
      autoRunEnabled: input.autoRunEnabled,
      enabledSources: input.enabledSources ?? currentConfig.enabledSources
    });

    return this.persistRuntimeConfig(nextConfig);
  }

  async updateSourceState(input: UpdateScraperAdminSourceStateInput): Promise<ScraperAdminConfig> {
    const availableSources = this.getAvailableSourceCodes();

    if (!availableSources.includes(input.sourceCode)) {
      throw new BadGatewayException("Источник не доступен в текущем deploy-контуре");
    }

    const currentConfig = await this.getCurrentConfig();
    const enabledSources = new Set(currentConfig.enabledSources);

    if (input.isActive) {
      enabledSources.add(input.sourceCode);
    } else {
      enabledSources.delete(input.sourceCode);
    }

    return this.persistRuntimeConfig({
      ...currentConfig,
      enabledSources: availableSources.filter((code) => enabledSources.has(code))
    });
  }

  async getBootstrapConfig(): Promise<RuntimeConfigRecord> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: SCRAPER_CONFIG_KEY }
    });

    if (!setting) {
      const defaults = this.getDefaultConfig();
      await this.syncSourceActivation(defaults.enabledSources);
      return defaults;
    }

    const normalized = this.normalizeConfig(setting.value);
    await this.syncSourceActivation(normalized.enabledSources);
    return normalized;
  }

  private async getCurrentConfig(): Promise<ScraperAdminConfig> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: SCRAPER_CONFIG_KEY }
    });

    if (!setting) {
      const defaults = this.getDefaultConfig();

      return {
        ...defaults,
        updatedAt: new Date(0),
        source: "default"
      };
    }

    const normalized = this.normalizeConfig(setting.value);

    return {
      ...normalized,
      updatedAt: setting.updatedAt,
      source: "database"
    };
  }

  private getDefaultConfig(): RuntimeConfigRecord {
    return {
      schedule: this.configService.get<string>("SCRAPE_SCHEDULE") ?? "*/20 * * * *",
      autoRunEnabled: true,
      enabledSources: this.getAvailableSourceCodes()
    };
  }

  private normalizeConfig(value: unknown): RuntimeConfigRecord {
    const defaults = this.getDefaultConfig();
    const raw =
      value && typeof value === "object" ? (value as Record<string, unknown>) : ({} as Record<string, unknown>);
    const enabledSourcesRaw = Array.isArray(raw.enabledSources)
      ? raw.enabledSources.filter((item): item is string => typeof item === "string")
      : defaults.enabledSources;

    return {
      schedule: typeof raw.schedule === "string" && raw.schedule.trim().length > 0
        ? raw.schedule.trim()
        : defaults.schedule,
      autoRunEnabled:
        typeof raw.autoRunEnabled === "boolean" ? raw.autoRunEnabled : defaults.autoRunEnabled,
      enabledSources: this.normalizeEnabledSources(enabledSourcesRaw)
    };
  }

  private async fetchRuntimeState(fallbackConfig: RuntimeConfigRecord): Promise<ScraperRuntimeState> {
    const controlUrl =
      this.configService.get<string>("SCRAPER_CONTROL_URL") ?? "http://scraper-service:3001";

    try {
      const response = await fetch(`${controlUrl}/api/runtime-status`);

      if (!response.ok) {
        throw new Error(`scraper-service returned ${response.status}`);
      }

      const payload = (await response.json()) as {
        schedule?: string;
        autoRunEnabled?: boolean;
        running?: boolean;
        runningSources?: string[];
        loadedSources?: string[];
        enabledSources?: string[];
        circuitStates?: Array<{ sourceCode: string; failures: number; openUntil?: string | null }>;
      };

      return {
        reachable: true,
        schedule: payload.schedule ?? fallbackConfig.schedule,
        autoRunEnabled: payload.autoRunEnabled ?? fallbackConfig.autoRunEnabled,
        running: payload.running ?? false,
        runningSources: payload.runningSources ?? [],
        loadedSources: this.normalizeEnabledSources(payload.loadedSources ?? fallbackConfig.enabledSources),
        enabledSources: this.normalizeEnabledSources(payload.enabledSources ?? fallbackConfig.enabledSources),
        circuitStates: (payload.circuitStates ?? []).map((item) => ({
          sourceCode: item.sourceCode,
          failures: item.failures,
          openUntil: item.openUntil ? new Date(item.openUntil) : null
        })),
        message: undefined
      };
    } catch (error) {
      return {
        reachable: false,
        schedule: fallbackConfig.schedule,
        autoRunEnabled: fallbackConfig.autoRunEnabled,
        running: false,
        runningSources: [],
        loadedSources: fallbackConfig.enabledSources,
        enabledSources: fallbackConfig.enabledSources,
        circuitStates: [],
        message:
          error instanceof Error
            ? error.message
            : "Не удалось получить состояние scraper-service"
      };
    }
  }

  private async applyRuntimeConfig(input: RuntimeConfigRecord): Promise<RuntimeConfigRecord> {
    const controlUrl =
      this.configService.get<string>("SCRAPER_CONTROL_URL") ?? "http://scraper-service:3001";

    const response = await fetch(`${controlUrl}/api/runtime-config`, {
      method: "PUT",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(input)
    }).catch((error) => {
      throw new BadGatewayException(
        error instanceof Error ? error.message : "Не удалось связаться с scraper-service"
      );
    });

    if (!response.ok) {
      const message = await response.text();
      throw new BadGatewayException(
        message || "scraper-service не принял новое расписание"
      );
    }

    const payload = (await response.json()) as RuntimeConfigRecord;

    return {
      schedule: payload.schedule,
      autoRunEnabled: payload.autoRunEnabled,
      enabledSources: this.normalizeEnabledSources(payload.enabledSources)
    };
  }

  private getAvailableSourceCodes(): string[] {
    const available = this.configService.get<string[]>("ENABLED_SOURCES") ?? [];
    return [...new Set(available.map((item) => item.trim()).filter(Boolean))];
  }

  private normalizeEnabledSources(sourceCodes: string[]): string[] {
    const requested = new Set(sourceCodes.map((item) => item.trim()).filter(Boolean));
    return this.getAvailableSourceCodes().filter((code) => requested.has(code));
  }

  private async persistRuntimeConfig(nextConfig: RuntimeConfigRecord): Promise<ScraperAdminConfig> {
    const applied = await this.applyRuntimeConfig(nextConfig);

    const setting = await this.prisma.systemSetting.upsert({
      where: { key: SCRAPER_CONFIG_KEY },
      update: {
        value: {
          schedule: nextConfig.schedule,
          autoRunEnabled: nextConfig.autoRunEnabled,
          enabledSources: nextConfig.enabledSources
        }
      },
      create: {
        key: SCRAPER_CONFIG_KEY,
        description: "Runtime configuration for scraper-service schedule",
        value: {
          schedule: nextConfig.schedule,
          autoRunEnabled: nextConfig.autoRunEnabled,
          enabledSources: nextConfig.enabledSources
        }
      }
    });

    await this.syncSourceActivation(applied.enabledSources);

    return {
      schedule: applied.schedule,
      autoRunEnabled: applied.autoRunEnabled,
      enabledSources: applied.enabledSources,
      updatedAt: setting.updatedAt,
      source: "database"
    };
  }

  private async syncSourceActivation(enabledSources: string[]) {
    const availableSources = this.getAvailableSourceCodes();

    if (availableSources.length === 0) {
      return;
    }

    await this.prisma.$transaction([
      this.prisma.source.updateMany({
        where: {
          code: { in: availableSources },
          deletedAt: null
        },
        data: {
          isActive: false
        }
      }),
      this.prisma.source.updateMany({
        where: {
          code: { in: enabledSources },
          deletedAt: null
        },
        data: {
          isActive: true
        }
      })
    ]);
  }
}
