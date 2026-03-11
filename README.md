# backend-api

![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?logo=githubactions&logoColor=white)
![CD](https://img.shields.io/badge/CD-GitHub_Deploy-2ea44f?logo=github&logoColor=white)
![Container](https://img.shields.io/badge/Container-GHCR-2496ED?logo=docker&logoColor=white)

Серверный API-слой с бизнес-логикой платформы мониторинга закупок.

## Что делает этот репозиторий

- поднимает GraphQL API (`/graphql`);
- хранит и выдает список закупок (черновой in-memory слой);
- принимает нормализованные события от `processing-worker` через mutation `ingestNormalizedItem`.

## Черновая реализация

- NestJS + GraphQL (Apollo);
- query `procurementItems`;
- mutation `ingestNormalizedItem`;
- endpoint здоровья `GET /api/health`;
- Dockerfile и CI workflow.

## Локальный запуск

```bash
cp .env.example .env
npm install
npm run start:dev
```

API по умолчанию:

- REST health: `http://localhost:3000/api/health`
- GraphQL: `http://localhost:3000/graphql`

## Пример GraphQL запроса

```graphql
query {
  procurementItems(limit: 10, offset: 0) {
    total
    items {
      externalId
      source
      title
      customer
      amount
      currency
    }
  }
}
```

## Связи с другими репозиториями

- `frontend-app` читает данные;
- `processing-worker` пишет нормализованные записи;
- контракты синхронизируются с `shared-contracts`.
