# Event Analytics - Plataforma de Ingestao e Painel

Produto de dados minimo viavel para receber eventos de negocio via API, persistir em PostgreSQL, expor metricas agregadas e apresentar um dashboard em Next.js.

## Stack

- Backend: Python 3.12, FastAPI, SQLAlchemy 2, PostgreSQL 16
- Frontend: Next.js 14 (App Router), TypeScript, Recharts
- Testes: pytest (backend), Vitest + Testing Library (frontend)
- Infra: Docker Compose

## Arquitetura

```
+-----------+        HTTP/JSON        +------------+        SQL        +------------+
|  Next.js  |  ---------------------> |  FastAPI   | ----------------> | PostgreSQL |
| Dashboard |  <---------------------  | /events    | <----------------  |  events    |
+-----------+     metricas agregadas   | /metrics   |   agregacoes SQL   +------------+
                                       +------------+
```

Camadas de dados:

- tabela `events` recebe o payload bruto validado (`event_id`, `event_type`, `occurred_at`, `user_id`, `properties` JSON). Indices em `event_type` e `occurred_at` para suportar consultas por janela.
- as consultas em `/metrics/*` executam agregacoes SQL sobre `events` (group by + date_trunc).

Decisoes:

- SQL direto para agregacoes porque Postgres resolve bem e dispensa ETL intermediario para o volume do MVP. Polars seria interessante num cenario batch sobre arquivos ou exportacao, fora do escopo.
- `properties` como JSON para aceitar metadados flexiveis (SKU, valor da compra, path, etc). Filtramos com operadores JSON nativos do Postgres.
- Serie temporal com `date_trunc('day' or 'week', occurred_at)`, granularidade controlada por query param.

## Idempotencia e validacao

- Idempotencia: `event_id` UUID e PK. A rota `POST /events` tenta inserir e captura conflito por PK, contando `accepted` vs `duplicates` e retornando no corpo. Aceita um objeto ou lista.
- Validacao: Pydantic garante tipos, formato ISO 8601 em `occurred_at` e `event_type` como enum (`page_view`, `signup`, `purchase`). Erros retornam HTTP 422 com detalhes. Payload vazio retorna 400.
- Erros de servidor sao retornados com status 500 e mensagem; o frontend trata com mensagem amigavel e botao de retry.

## Como subir

Pre-requisitos: Docker Desktop.

1. Copie `.env.example` para `.env` (opcional, defaults funcionam).
2. Suba API + banco:

```bash
docker compose up -d db api
```

3. Popule com dataset de demonstracao (~12 mil eventos sinteticos em 30 dias):

```bash
docker compose --profile seed run --rm seed
```

4. Suba o frontend:

```bash
docker compose --profile web up -d web
```

Acessos:

- API + OpenAPI interativo: http://localhost:8000/docs
- Health: http://localhost:8000/health
- Dashboard: http://localhost:3000

Para rodar o frontend em dev local (hot reload) sem Docker:

```bash
cd frontend
npm install
npm run dev
```

## Variaveis de ambiente

| Variavel | Default | Descricao |
|---|---|---|
| `POSTGRES_USER` | `postgres` | usuario do banco |
| `POSTGRES_PASSWORD` | `postgres` | senha do banco |
| `POSTGRES_DB` | `events` | nome do banco |
| `DATABASE_URL` | derivado | URL SQLAlchemy usada pela API |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | URL base consumida pelo front |

## API

| Metodo | Rota | Descricao |
|---|---|---|
| POST | `/events` | ingere 1 evento ou lista de eventos |
| GET | `/events?event_type=&limit=` | ultimos eventos (drill-down) |
| GET | `/metrics/kpis?start&end` | KPIs do periodo |
| GET | `/metrics/timeseries?start&end&granularity=day|week` | volume por periodo e tipo |
| GET | `/metrics/funnel?start&end` | funil page_view -> signup -> purchase |
| GET | `/metrics/top-skus?start&end&limit` | top SKUs por volume e receita |
| GET | `/health` | liveness + check de banco |

Exemplo de ingestao:

```bash
curl -X POST http://localhost:8000/events \
  -H 'Content-Type: application/json' \
  -d '{
    "event_id": "11111111-1111-1111-1111-111111111111",
    "event_type": "purchase",
    "occurred_at": "2026-04-10T12:00:00Z",
    "user_id": "user_0001",
    "properties": {"sku": "SKU-001", "value": 199.9}
  }'
```

## Frontend

- Pagina unica (`/`) com seletor de periodo, KPIs, grafico de linhas (serie temporal por tipo), funil visual, tabela de top SKUs e tabela de drill-down dos ultimos eventos.
- Consumo via `fetch` client-side com `cache: 'no-store'` para garantir dados atuais. SSR seria simples de plugar, mas o filtro interativo favorece client fetch para responsividade.
- Cenario de falha: quando a API fica fora do ar, o painel exibe banner vermelho com mensagem clara e botao "tentar novamente". Um polling leve de `/health` indica status da API no topo. O estado anterior permanece visivel para nao quebrar a experiencia.

## Testes

Backend (API):

```bash
cd backend
pip install -r requirements.txt
pytest
```

Frontend (componente do dashboard):

```bash
cd frontend
npm install
npm test
```

Testes cobrem: health, ingestao unitaria, ingestao em lote com deduplicacao, validacao de tipo invalido, listagem filtrada (backend) e render do dashboard com dados mockados e estado de erro (frontend).

## Gerenciamento de dependencias

- Python: `requirements.txt` com versoes fixadas. Foi escolhido por simplicidade sobre Poetry/uv; migracao trivial se necessario.
- Node: `package.json` com versoes fixadas, `npm` padrao.

## Diferenciais previstos (nao implementados para manter o MVP enxuto)

## Estrutura

```
P1/
  backend/
    app/
      main.py           FastAPI app e health
      db.py             engine/session
      models.py         tabela events
      schemas.py        Pydantic
      routes/
        events.py       ingestao + listagem
        metrics.py      KPIs, timeseries, funil, top SKUs
      seed.py           gerador sintetico
    tests/test_api.py
    Dockerfile
    requirements.txt
  frontend/
    app/                App Router, layout e page
    components/Dashboard.tsx
    lib/api.ts
    __tests__/Dashboard.test.tsx
    Dockerfile
  docker-compose.yml
  .env.example
  README.md
```
