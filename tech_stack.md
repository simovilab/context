# SIMOVI Technology Stack

**_Intelligent Mobility Systems Lab_ (SIMOVI) <br> University of Costa Rica**

This document outlines the technology stack used at SIMOVI for research and development in intelligent mobility systems, including public transportation information systems, data analysis, and web applications.

## Backend Technologies

### ![Python logo](https://api.iconify.design/simple-icons:python.svg) Python

**Purpose:** Primary programming language for backend development and data analysis  
**Use at SIMOVI:** Core language for API development, data processing, machine learning models, and research algorithms. Chosen for its extensive ecosystem in data science and web development.

### ![Django logo](https://api.iconify.design/simple-icons:django.svg) Django

**Purpose:** High-level Python web framework  
**Use at SIMOVI:** Development of robust web APIs and backend services for transportation information systems. Provides ORM, authentication, and rapid development capabilities for research prototypes and production systems.

### ![Django logo](https://api.iconify.design/simple-icons:django.svg) Django Channels

**Purpose:** ASGI-based real-time communications framework for Django, enabling WebSockets, long-lived connections, pub/sub patterns, and background consumers via channel layers (e.g., Redis).  
**Use at SIMOVI:** Powering real-time features such as live vehicle tracking, arrival countdowns, alerts/notifications, and operator dashboards. Deployed under ASGI alongside Django with a Redis channel layer to push transit updates to websites, in-vehicle/at-stop screens, and other clients.

### ![Celery logo](https://api.iconify.design/simple-icons:celery.svg) Celery Worker / Beat

**Purpose:** Distributed task queue system  
**Use at SIMOVI:** Handling asynchronous tasks such as data processing, GTFS feed updates, real-time transit data ingestion, and scheduled operations. Beat scheduler manages periodic tasks like data synchronization.

### ![Airflow logo](https://api.iconify.design/simple-icons:apacheairflow.svg) Apache Airflow

**Purpose:** Workflow automation and scheduling platform  
**Use at SIMOVI:** Orchestrating complex data pipelines, automating ETL processes, and managing scheduled tasks for public transportation data ingestion and processing. Enables reproducible, maintainable, and auditable workflows for research and production systems.

### ![PostgreSQL logo](https://api.iconify.design/simple-icons:postgresql.svg) PostgreSQL / PostGIS

**Purpose:** Relational database with spatial extensions  
**Use at SIMOVI:** Storage of transportation data, GTFS datasets, and geospatial information. PostGIS enables advanced spatial queries for route planning, stop proximity analysis, and geographic data processing.

### ![TimescaleDB logo](https://api.iconify.design/simple-icons:timescale.svg) PostgreSQL / TimescaleDB

**Purpose:** Time-series database extension for PostgreSQL that provides hypertables, continuous aggregates, compression, and time-based partitioning for scalable time-series storage and analytics.  
**Use at SIMOVI:** Persisting high-frequency telemetry and vehicle tracking time series; powering downsampling, retention policies, and efficient queries over time windows for dashboards, analytics, and model features.

### ![MongoDB logo](https://api.iconify.design/simple-icons:mongodb.svg) MongoDB / DocumentDB (on PostgreSQL)

**Purpose:** Document-oriented NoSQL with BSON data support; DocumentDB provides MongoDB-compatible collections and CRUD on top of PostgreSQL.  
**Use at SIMOVI:** Managing semi-structured and event data such as JSON/BSON telemetry, API payloads, GTFS Realtime messages, and logs; enabling flexible schemas and document queries side-by-side with relational and time-series workloads.

### ![Redis logo](https://api.iconify.design/simple-icons:redis.svg) Redis

**Purpose:** In-memory data structure store  
**Use at SIMOVI:** Caching frequently accessed data, session storage, and message broker for Celery. Improves performance of real-time transportation information queries.

### ![Redis logo](https://api.iconify.design/simple-icons:redis.svg) Redis Streams

**Purpose:** Log-structured, append-only streaming data type in Redis for ordered event ingestion with persistence, consumer groups, backpressure, and replay support. Suited for high-throughput, low-latency pipelines and fan-out processing.  
**Use at SIMOVI:** Storing high-frequency vehicle tracking and telemetry readings as events; buffering ingestion from MQTT (RabbitMQ) and feeding multiple consumers (Django Channels push, Celery workers, ETL/Airflow jobs). Enables time-windowed aggregation, reprocessing, and resilient delivery for real-time dashboards and downstream services.

### ![RabbitMQ logo](https://api.iconify.design/simple-icons:rabbitmq.svg) RabbitMQ

**Purpose:** Message broker with MQTT protocol support  
**Use at SIMOVI:** MQTT broker for collecting real-time location updates from transit vehicles and distributing real-time updates to downstream services. Enables reliable, scalable messaging between IoT devices, backend services, and real-time information systems for public transportation data streams.

### ![GraphQL logo](https://api.iconify.design/simple-icons:graphql.svg) Strawberry

**Purpose:** Modern GraphQL library for Python  
**Use at SIMOVI:** Delivering augmented transit data to information services like websites, screens, mobile apps, and other client applications. Provides efficient, flexible data fetching with type safety, enabling clients to request exactly the transportation data they need while reducing over-fetching and improving performance of real-time information systems.

### ![Flink icon](https://api.iconify.design/simple-icons:apacheflink.svg) Bytewax

**Purpose:** Python-first framework and Rust-powered distributed engine for stateful event and stream processing. Inspired by Apache Flink, Spark, and Kafka Streams, it integrates natively with the Python ecosystem while providing scalable dataflows, automatic state management and recovery, windowing, and a rich connector model. The Dataflow API composes pipelines with familiar operators (map, filter, join, fold_window, etc.).
**Use at SIMOVI:** Building real-time, stateful pipelines over transit telemetry and events: ingesting from MQTT (RabbitMQ), WebSockets, or custom sources; maintaining per-vehicle state; computing windowed aggregates (headways, dwell times, delays), geofence detections, and anomaly signals; joining with GTFS/static data in PostgreSQL; and emitting derived streams to Redis Streams, persisting to TimescaleDB hypertables, and priming caches for Django Channels pushes and Strawberry GraphQL queries. Designed to scale from local development to multi-node deployments on Docker/Kubernetes, with OpenTelemetry instrumentation for metrics and traces.

### ![Apache logo](https://api.iconify.design/simple-icons:apache.svg) Apache Jena Fuseki

**Purpose:** SPARQL server and RDF triple store  
**Use at SIMOVI:** Storing, querying, and managing semantic web data such as transportation ontologies and linked data. Enables advanced data integration, semantic queries, and interoperability for research in intelligent mobility systems.

### ![MCP logo](https://api.iconify.design/simple-icons:modelcontextprotocol.svg) FastMCP

**Purpose:** Pythonic implementation of the Model Context Protocol (MCP) for building both servers and clients. Provides a fast, ergonomic way to define tools, resources, prompts, and capabilities for LLM integrations.  
**Use at SIMOVI:** Implementing MCP servers that expose transportation-domain tools (e.g., next-trip lookup, stop search, alerts, geospatial queries) and resources backed by Infobús and Databús APIs; and running MCP clients to connect LLMs (e.g., Claude Desktop) with real-time, curated transit data for multilingual chat experiences, operator assistants, and research workflows.

### ![Strapi logo](https://api.iconify.design/simple-icons:strapi.svg) Strapi CMS

**Purpose:** Headless content management system  
**Use at SIMOVI:** Managing dynamic content, documentation, and configuration data for transportation information systems. Provides non-technical team members with content editing capabilities.

## Frontend Technologies

### ![TypeScript logo](https://api.iconify.design/simple-icons:typescript.svg) TypeScript

**Purpose:** Typed superset of JavaScript  
**Use at SIMOVI:** Development of type-safe frontend applications with better code maintainability and developer experience. Essential for large-scale transportation interface applications.

### ![Vue.js logo](https://api.iconify.design/simple-icons:vuedotjs.svg) Vue

**Purpose:** Progressive JavaScript framework  
**Use at SIMOVI:** Building reactive user interfaces for transportation information systems, administrative dashboards, and research data visualization tools.

### ![Nuxt logo](https://api.iconify.design/simple-icons:nuxtdotjs.svg) Nuxt

**Purpose:** Vue.js meta-framework  
**Use at SIMOVI:** Server-side rendering, static site generation, and full-stack development of transportation information websites and applications. Provides SEO optimization and performance benefits.

### ![Nuxt logo](https://api.iconify.design/simple-icons:nuxtdotjs.svg) Nuxt UI

**Purpose:** Open-source UI library of 100+ customizable components built with Tailwind CSS and Reka UI for Nuxt applications.  
**Use at SIMOVI:** Building consistent, accessible, and responsive interfaces for Nuxt-based websites, admin panels, and passenger information screens; accelerating development with prebuilt components, Tailwind theming, dark mode support, and design-system primitives that integrate seamlessly with the existing Vue/Nuxt stack.

### ![Capacitor logo](https://api.iconify.design/simple-icons:capacitor.svg) Capacitor

**Purpose:** Cross-platform native runtime  
**Use at SIMOVI:** Deploying web-based transportation apps to iOS and Android platforms. Enables access to native device features like GPS, notifications, and offline storage.

### ![Ionic logo](https://api.iconify.design/simple-icons:ionic.svg) Ionic UI

**Purpose:** Mobile-focused UI component library  
**Use at SIMOVI:** Creating mobile-optimized interfaces for transportation apps, ensuring consistent user experience across different devices and platforms.

## DevOps & Monitoring

### ![Grafana logo](https://api.iconify.design/simple-icons:grafana.svg) Grafana

**Purpose:** Data visualization and monitoring platform  
**Use at SIMOVI:** Creating dashboards for system performance monitoring, transportation data analytics, and research metrics visualization. Integrates with various data sources.

### ![Prometheus logo](https://api.iconify.design/simple-icons:prometheus.svg) Prometheus

**Purpose:** Time-series database and monitoring system  
**Use at SIMOVI:** Collecting and storing metrics from applications and infrastructure. Monitors API performance, database health, and system resource usage.

### ![Docker logo](https://api.iconify.design/simple-icons:docker.svg) Docker

**Purpose:** Containerization platform  
**Use at SIMOVI:** Packaging and deploying applications and services in isolated, reproducible environments. Simplifies development, testing, and deployment workflows for backend, frontend, and data processing components. Ensures consistency across local development and production infrastructure.

### ![Search icon](https://api.iconify.design/ic:round-screen-search-desktop.svg) Zabbix

**Purpose:** Enterprise-grade network and application monitoring  
**Use at SIMOVI:** Infrastructure monitoring, alerting, and performance tracking of servers and network components supporting transportation information systems.

### ![Security icon](https://api.iconify.design/ic:baseline-security.svg) Wazuh

**Purpose:** Security information and event management (SIEM)  
**Use at SIMOVI:** Security monitoring, threat detection, and compliance management for research infrastructure and transportation data systems.

### ![OpenTelemetry logo](https://api.iconify.design/simple-icons:opentelemetry.svg) OpenTelemetry

**Purpose:** Vendor-neutral observability framework and open standard for generating, collecting, and exporting telemetry data — traces, metrics, and logs — across distributed systems. Supports OTLP and common backends (Prometheus, Grafana Tempo, Jaeger, Loki) with automatic and manual instrumentation SDKs.  
**Use at SIMOVI:** Instrumenting Django/ASGI (Channels), Celery tasks, Airflow DAGs, RabbitMQ message flows, PostgreSQL queries, and external HTTP calls (Infobús/Databús). Exports metrics to Prometheus and traces/logs via OTLP to Jaeger/Tempo/Loki; enables end-to-end request tracing, performance analysis, and error correlation across services, including optional browser instrumentation for Nuxt frontends.

## Data Analysis & Research

### ![Pandas logo](https://api.iconify.design/simple-icons:pandas.svg) Pandas

**Purpose:** Data manipulation and analysis library  
**Use at SIMOVI:** Processing transportation datasets, GTFS data analysis, ridership pattern analysis, and data cleaning for research projects. Primary tool for structured data operations.

### ![NumPy logo](https://api.iconify.design/simple-icons:numpy.svg) NumPy

**Purpose:** Numerical computing library  
**Use at SIMOVI:** Mathematical operations on transportation data, statistical calculations, and foundation for other data science libraries used in mobility research.

### ![SciPy logo](https://api.iconify.design/simple-icons:scipy.svg) SciPy

**Purpose:** Scientific computing ecosystem  
**Use at SIMOVI:** Advanced statistical analysis, optimization algorithms for route planning, signal processing for transportation data, and scientific computing for research projects.

### ![scikit-learn logo](https://api.iconify.design/simple-icons:scikitlearn.svg) scikit-learn

**Purpose:** Machine learning library  
**Use at SIMOVI:** Predictive modeling for transportation demand, classification of mobility patterns, clustering analysis of transportation data, and ML model development for intelligent mobility systems.

### ![Chart icon](https://api.iconify.design/ic:baseline-area-chart.svg) Matplotlib

**Purpose:** Data visualization library  
**Use at SIMOVI:** Creating charts, graphs, and visualizations for research publications, transportation data analysis reports, and exploratory data analysis in mobility research.

## Development tools

### ![uv icon](https://api.iconify.design/simple-icons:uv.svg) uv

**Purpose:** Fast, modern Python package and environment manager that unifies dependency resolution, virtual environments, and reproducible builds via lockfiles (pyproject.toml + uv.lock). Optimized for speed, deterministic installs, and monorepos/CI.  
**Use at SIMOVI:** Standardizing Python environments across services and research projects; speeding up container builds and CI by caching and lockfiles; ensuring reproducible experiments and deployments for Django, Celery, Airflow, and data science pipelines.

### ![pnpm logo](https://api.iconify.design/simple-icons:pnpm.svg) pnpm

**Purpose:** Performant JavaScript/TypeScript package manager with content-addressable storage, workspace support, and strict, deterministic installs. Saves disk space and accelerates CI and local development.  
**Use at SIMOVI:** Managing dependencies and workspaces for Vue/Nuxt/Ionic frontends and documentation sites; enabling fast, consistent installs in CI/CD; improving developer ergonomics in multi-app repositories.

### ![Diagram icon](https://api.iconify.design/tabler:hierarchy-2.svg) Structurizr DSL

**Purpose:** Text-based domain-specific language for authoring C4 model architecture diagrams (System Context, Container, Component, and Code) as code. Defines people, software systems, containers, components, and relationships; configures views, styles/themes, and documentation sections.
**Use at SIMOVI:** Maintaining living C4 diagrams of Databús/Infobús services, MCP integrations, real-time streaming (RabbitMQ, Redis Streams, Bytewax), storage layers (PostgreSQL/PostGIS/TimescaleDB, MongoDB/DocumentDB), and delivery (Django/Channels, Strawberry, Nuxt). Diagrams are generated in CI for documentation sites and READMEs, enabling architecture reviews via pull requests. Complements Diagrams (Python): Structurizr DSL captures logical C4 architecture, while Diagrams focuses on infrastructure/topology visuals.

### ![Diagram icon](https://api.iconify.design/tabler:hierarchy-2.svg) Diagrams (Python)

**Purpose:** Diagram-as-code library for generating architecture diagrams (cloud/on-prem/Kubernetes/network) from Python code; outputs to PNG/SVG using Graphviz. Keeps system design version-controlled and reviewable.  
**Use at SIMOVI:** Maintaining up-to-date system and data-flow diagrams for Databús/Infobús, MCP integrations, DevOps topologies, and research prototypes; embedding generated diagrams in documentation and publications for clear, consistent communication.

## Architecture Overview

This technology stack enables SIMOVI to:

- **Collect and process** real-time transportation data through robust backend systems
- **Analyze and model** mobility patterns using advanced data science tools
- **Develop user-friendly interfaces** for public transportation information systems
- **Deploy cross-platform applications** for mobile and web environments
- **Monitor and maintain** reliable research infrastructure
- **Ensure security and compliance** of transportation data systems

The stack is designed to support both rapid prototyping for research projects and scalable production deployments for real-world transportation information systems like the *b*UCR pilot program at the University of Costa Rica.
