# SIMOVI Technology Stack

**_Intelligent Mobility Systems Lab_ (SIMOVI) <br> University of Costa Rica**

This document outlines the technology stack used at SIMOVI for research and development in intelligent mobility systems, including public transportation information systems, data analysis, and web applications.

## Backend Technologies

### ![Celery logo](https://api.iconify.design/simple-icons:python.svg) Python

**Purpose:** Primary programming language for backend development and data analysis  
**Use at SIMOVI:** Core language for API development, data processing, machine learning models, and research algorithms. Chosen for its extensive ecosystem in data science and web development.

### ![Django logo](https://api.iconify.design/simple-icons:django.svg) Django

**Purpose:** High-level Python web framework  
**Use at SIMOVI:** Development of robust web APIs and backend services for transportation information systems. Provides ORM, authentication, and rapid development capabilities for research prototypes and production systems.

### ![Celery logo](https://api.iconify.design/simple-icons:celery.svg) Celery (Worker / Beat)

**Purpose:** Distributed task queue system  
**Use at SIMOVI:** Handling asynchronous tasks such as data processing, GTFS feed updates, real-time transit data ingestion, and scheduled operations. Beat scheduler manages periodic tasks like data synchronization.

### ![Airflow logo](https://api.iconify.design/simple-icons:apacheairflow.svg) Apache Airflow

**Purpose:** Workflow automation and scheduling platform  
**Use at SIMOVI:** Orchestrating complex data pipelines, automating ETL processes, and managing scheduled tasks for public transportation data ingestion and processing. Enables reproducible, maintainable, and auditable workflows for research and production systems.

### ![PostgreSQL logo](https://api.iconify.design/simple-icons:postgresql.svg) PostgreSQL / PostGIS

**Purpose:** Relational database with spatial extensions  
**Use at SIMOVI:** Storage of transportation data, GTFS datasets, and geospatial information. PostGIS enables advanced spatial queries for route planning, stop proximity analysis, and geographic data processing.

### ![Redis logo](https://api.iconify.design/simple-icons:redis.svg) Redis

**Purpose:** In-memory data structure store  
**Use at SIMOVI:** Caching frequently accessed data, session storage, and message broker for Celery. Improves performance of real-time transportation information queries.

### ![Apache Jena logo](https://api.iconify.design/simple-icons:apache.svg) Apache Jena Fuseki

**Purpose:** SPARQL server and RDF triple store  
**Use at SIMOVI:** Storing, querying, and managing semantic web data such as transportation ontologies and linked data. Enables advanced data integration, semantic queries, and interoperability for research in intelligent mobility systems.

### ![Strapi logo](https://api.iconify.design/simple-icons:strapi.svg) Strapi CMS

**Purpose:** Headless content management system  
**Use at SIMOVI:** Managing dynamic content, documentation, and configuration data for transportation information systems. Provides non-technical team members with content editing capabilities.

## Frontend Technologies

### ![TypeScript logo](https://api.iconify.design/simple-icons:typescript.svg) TypeScript

**Purpose:** Typed superset of JavaScript  
**Use at SIMOVI:** Development of type-safe frontend applications with better code maintainability and developer experience. Essential for large-scale transportation interface applications.

### ![Vue.js logo](https://api.iconify.design/simple-icons:vuedotjs.svg) Vue.js

**Purpose:** Progressive JavaScript framework  
**Use at SIMOVI:** Building reactive user interfaces for transportation information systems, administrative dashboards, and research data visualization tools.

### ![Nuxt logo](https://api.iconify.design/simple-icons:nuxtdotjs.svg) Nuxt

**Purpose:** Vue.js meta-framework  
**Use at SIMOVI:** Server-side rendering, static site generation, and full-stack development of transportation information websites and applications. Provides SEO optimization and performance benefits.

### ![Capacitor logo](https://api.iconify.design/simple-icons:capacitor.svg) Capacitor

**Purpose:** Cross-platform native runtime  
**Use at SIMOVI:** Deploying web-based transportation apps to iOS and Android platforms. Enables access to native device features like GPS, notifications, and offline storage.

### ![PrimeVue logo](https://api.iconify.design/simple-icons:primereact.svg) PrimeVue UI

**Purpose:** Rich set of UI components for Vue.js  
**Use at SIMOVI:** Rapid development of professional-looking interfaces for transportation dashboards, data tables, and administrative panels with minimal custom styling.

### ![Ionic logo](https://api.iconify.design/simple-icons:ionic.svg) Ionic UI

**Purpose:** Mobile-focused UI component library  
**Use at SIMOVI:** Creating mobile-optimized interfaces for transportation apps, ensuring consistent user experience across different devices and platforms.

## DevOps and Monitoring

### ![Grafana logo](https://api.iconify.design/simple-icons:grafana.svg) Grafana

**Purpose:** Data visualization and monitoring platform  
**Use at SIMOVI:** Creating dashboards for system performance monitoring, transportation data analytics, and research metrics visualization. Integrates with various data sources.

### ![Prometheus logo](https://api.iconify.design/simple-icons:prometheus.svg) Prometheus

**Purpose:** Time-series database and monitoring system  
**Use at SIMOVI:** Collecting and storing metrics from applications and infrastructure. Monitors API performance, database health, and system resource usage.

### ![Docker logo](https://api.iconify.design/simple-icons:docker.svg) Docker

**Purpose:** Containerization platform  
**Use at SIMOVI:** Packaging and deploying applications and services in isolated, reproducible environments. Simplifies development, testing, and deployment workflows for backend, frontend, and data processing components. Ensures consistency across local development and production infrastructure.

### ![Zabbix logo](https://api.iconify.design/ic:round-screen-search-desktop.svg) Zabbix

**Purpose:** Enterprise-grade network and application monitoring  
**Use at SIMOVI:** Infrastructure monitoring, alerting, and performance tracking of servers and network components supporting transportation information systems.

### ![Wazuh logo](https://api.iconify.design/ic:baseline-security.svg) Wazuh

**Purpose:** Security information and event management (SIEM)  
**Use at SIMOVI:** Security monitoring, threat detection, and compliance management for research infrastructure and transportation data systems.

## Data Analysis and Research

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

### ![Matplotlib logo](https://api.iconify.design/ic:baseline-area-chart.svg) Matplotlib

**Purpose:** Data visualization library  
**Use at SIMOVI:** Creating charts, graphs, and visualizations for research publications, transportation data analysis reports, and exploratory data analysis in mobility research.

## Architecture Overview

This technology stack enables SIMOVI to:

- **Collect and process** real-time transportation data through robust backend systems
- **Analyze and model** mobility patterns using advanced data science tools
- **Develop user-friendly interfaces** for public transportation information systems
- **Deploy cross-platform applications** for mobile and web environments
- **Monitor and maintain** reliable research infrastructure
- **Ensure security and compliance** of transportation data systems

The stack is designed to support both rapid prototyping for research projects and scalable production deployments for real-world transportation information systems like the *b*UCR pilot program at the University of Costa Rica.
