import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  IngestNormalizedItemInput,
  IngestResult,
  ProcurementItem,
  ProcurementItemPage
} from "./models";

@Injectable()
export class ProcurementService {
  private readonly items = new Map<string, ProcurementItem>();

  constructor() {
    const seed: ProcurementItem[] = [
      {
        externalId: "demo-1",
        source: "demo-source",
        title: "Поставка насосного оборудования",
        customer: "АЭС Север",
        supplier: "ООО ТехПоставка",
        amount: 1250000,
        currency: "RUB",
        publishedAt: new Date().toISOString()
      }
    ];

    for (const item of seed) {
      this.items.set(this.makeKey(item.source, item.externalId), item);
    }
  }

  find(search?: string, source?: string, limit = 20, offset = 0): ProcurementItemPage {
    let data = [...this.items.values()];

    if (source) {
      data = data.filter((item) => item.source === source);
    }

    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.customer?.toLowerCase().includes(q) ||
          item.supplier?.toLowerCase().includes(q)
      );
    }

    const total = data.length;
    const items = data.slice(offset, offset + limit);

    return { total, items };
  }

  ingest(input: IngestNormalizedItemInput): IngestResult {
    const key = this.makeKey(input.source, input.externalId);

    this.items.set(key, {
      externalId: input.externalId,
      source: input.source,
      title: input.title,
      customer: input.customer,
      supplier: input.supplier,
      amount: input.amount,
      currency: input.currency,
      publishedAt: input.publishedAt,
      rawPayload: input.rawPayload
    });

    return {
      accepted: true,
      idempotencyKey: createHash("sha256").update(key).digest("hex").slice(0, 32)
    };
  }

  private makeKey(source: string, externalId: string): string {
    return `${source}:${externalId}`;
  }
}
