# Infobús Architecture

`backend` is a folder with the codebase for `orchestrator`, `engine`, `scheduler` and `streams-consumer`. It contains the Django project and the Celery Worker, Celery Beat and stream-consumer entrypoints. This way, every process has access to the Django models and utilities.

Solid boxes are implemented. Dashed boxes are provisioned scaffolding with no connected domain path yet.

```mermaid
flowchart LR
    subgraph GTFS
        schedule([Schedule])
        realtime([Realtime])
    end
    subgraph Clients
        api([REST API])
        ws([WebSocket<br/>ws/updates/])
    end

    orchestrator(("orchestrator<br/>(Django / Daphne)"))
    engine(("engine<br/>(Celery worker)"))
    scheduler(("scheduler<br/>(Celery Beat)"))
    streams(("streams-consumer<br/>(updates.client)"))
    memory(("memory<br/>(Redis)"))
    database@{ shape: db, label: "database<br/>(PostgreSQL + PostGIS)" }
    lake@{ shape: docs, label: "Data Lake<br/>(Parquet)" }

    subgraph Scaffolding
        ui["user-interface<br/>(Nuxt, mock data)"]
        broker["broker<br/>(RabbitMQ, unused)"]
        context["context<br/>(FastMCP, greet tool)"]
        knowledge["knowledge<br/>(Jena Fuseki, empty)"]
    end

    schedule --"HTTP polling"--> engine
    realtime --"HTTP polling"--> engine
    scheduler --"periodic tasks"--> memory
    memory --"Celery task queue"--> engine
    engine <-."reads / writes".-> database
    engine -."run state + XADD events".-> memory
    engine -."saves hourly".-> lake
    memory -."XREADGROUP events".-> streams
    streams -."reads projections".-> database
    streams -."Channels group_send".-> memory
    orchestrator <-."reads / writes".-> database
    orchestrator <-."state, Channels layer".-> memory
    api --> orchestrator
    ws --> orchestrator

    ui -.-> orchestrator
    context -.-> knowledge
    context -.-> orchestrator

    classDef scaffold stroke-dasharray:5 5;
    class ui,broker,context,knowledge scaffold;
```

Redis (`memory`) is the Celery broker, the Channels layer, the store for current run state and the home of the `events` stream. RabbitMQ is provisioned but not used by Celery. Upstream feed URLs are stored in the database on `FeedPublisher` records.
