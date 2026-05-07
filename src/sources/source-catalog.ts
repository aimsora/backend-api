import { Prisma, SourceKind, type PrismaClient } from "@prisma/client";

export type SourceCatalogItem = {
  code: string;
  name: string;
  description: string;
  kind: SourceKind;
  baseUrl?: string;
};

const LEGACY_SOURCE_CODES = ["demo-source", "find-tender"] as const;

export const SOURCE_CATALOG: SourceCatalogItem[] = [
  {
    code: "easuz",
    name: "ЕАСУЗ Московской области",
    description: "Региональный источник закупок Московской области.",
    kind: SourceKind.EASUZ,
    baseUrl: "https://easuz.mosreg.ru"
  },
  {
    code: "eis",
    name: "ЕИС / zakupki.gov.ru",
    description: "Федеральный источник закупок ЕИС.",
    kind: SourceKind.EIS,
    baseUrl: "https://zakupki.gov.ru"
  },
  {
    code: "eis_contracts",
    name: "ЕИС / реестр контрактов 44-ФЗ",
    description: "Федеральный реестр исполненных и действующих контрактов 44-ФЗ.",
    kind: SourceKind.EIS,
    baseUrl: "https://zakupki.gov.ru"
  },
  {
    code: "eis_contracts_223",
    name: "ЕИС / реестр договоров 223-ФЗ",
    description: "Федеральный реестр договоров, заключенных по закупкам 223-ФЗ.",
    kind: SourceKind.EIS,
    baseUrl: "https://zakupki.gov.ru"
  },
  {
    code: "rnp",
    name: "Реестр недобросовестных поставщиков",
    description: "Реестр недобросовестных поставщиков на базе zakupki.gov.ru.",
    kind: SourceKind.RNP,
    baseUrl: "https://zakupki.gov.ru"
  },
  {
    code: "fedresurs",
    name: "Федресурс",
    description: "Источник сигналов о банкротстве и иных риск-событиях.",
    kind: SourceKind.FEDRESURS,
    baseUrl: "https://bankrot.fedresurs.ru"
  },
  {
    code: "fns",
    name: "ФНС ЕГРЮЛ/ЕГРИП",
    description: "Источник регистрационных и корпоративных данных ФНС.",
    kind: SourceKind.FNS,
    baseUrl: "https://egrul.nalog.ru"
  },
  {
    code: "gistorgi",
    name: "ГИС Торги",
    description: "Источник лотов и торгов с torgi.gov.ru.",
    kind: SourceKind.GISTORGI,
    baseUrl: "https://torgi.gov.ru"
  }
];

export function getSourceCatalogItem(code: string): SourceCatalogItem | undefined {
  return SOURCE_CATALOG.find((item) => item.code === code);
}

export function getEnabledCatalogItems(enabledSourceCodes: string[]): SourceCatalogItem[] {
  const enabledSet = new Set(enabledSourceCodes);

  return SOURCE_CATALOG.filter((item) => enabledSet.has(item.code));
}

export async function syncEnabledSourcesCatalog(
  prisma: PrismaClient,
  enabledSourceCodes: string[]
) {
  const items = getEnabledCatalogItems(enabledSourceCodes);
  const operations: Prisma.PrismaPromise<unknown>[] = items.map((item) =>
    prisma.source.upsert({
      where: { code: item.code },
      update: {
        name: item.name,
        description: item.description,
        kind: item.kind,
        baseUrl: item.baseUrl,
        deletedAt: null
      },
      create: {
        code: item.code,
        name: item.name,
        description: item.description,
        kind: item.kind,
        baseUrl: item.baseUrl,
        isActive: true
      }
    })
  );

  operations.push(
    prisma.source.updateMany({
      where: {
        code: { in: [...LEGACY_SOURCE_CODES] },
        deletedAt: null
      },
      data: {
        isActive: false,
        deletedAt: new Date()
      }
    })
  );

  await prisma.$transaction(operations);
}
