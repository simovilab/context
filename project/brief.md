# InfoTP Context Studio — Project Brief

## Official project

**"Desarrollo de la Primera Fase del Sistema Nacional de Información para las Personas Usuarias del Transporte Público de Costa Rica"**

"InfoTP" is not this project's own name — it is the SIMOVI-developed *model* of a public-transport information system. This project implements that InfoTP model in its first phase, so the repository and its context tree are named after the model it operationalizes.

## What & why

The project institutionalizes public-transport data management, builds interoperable digital infrastructure, and orders the public identity of Costa Rica's public-transport information system. It is motivated by a documented gap: of 372 registered routes evaluated in the SIMOVI 2024 study, only about 10% had an "acceptable" web presence by the study's information-availability criteria. The project addresses this by consolidating official CTP, INCOFER, and ARESEP data into a governed GTFS dataset, building institutional tooling to maintain it, and exposing it through public-facing digital services (APIs, a website, real-time alerts, and consistent visual identity/signage).

## Who

- **Executing institution**: Fundación de la Universidad de Costa Rica para la Investigación (FundaciónUCR).
- **Technical execution**: Laboratorio de Sistemas Inteligentes de Movilidad (SIMOVI), Escuela de Ingeniería Eléctrica (EIE), Universidad de Costa Rica.
- **Participating institutions**: CTP, ARESEP, MOPT, INCOFER.
- **Funder**: GIZ (German cooperation).

## Shape

- **Duration**: 16 months, divided into 8 bimesters.
- **Components**: 7 (C1–C7).
- **Deliverables**: 21 "resultados esperados" across the 7 components.
- **Reports**: INF1 (bimonthly, recurring), INF2 (semi-annual, recurring), INF3 (final report, once).

## Milestones

| Hito | Name | Timing |
|---|---|---|
| A | Inicio | Month 1 |
| B | Revisión de datos | Bimester 2 |
| C | Publicación de GTFS | Bimester 4 |
| D | Evaluación | Bimester 6 |
| E | Lanzamiento público | Bimester 7 |
| F | Final | Month 16 |

## Components at a glance

| ID | Name (Spanish) | Gloss (English) | Deliverables |
|---|---|---|---|
| C1 | Gestión de datos del transporte público | Public transport data management | 3 |
| C2 | Editor administrativo de datos GTFS | GTFS data administrative editor | 3 |
| C3 | Sistema de alertas en tiempo real de GTFS | GTFS real-time alerts system | 2 |
| C4 | Soluciones de integración para servicios digitales | Integration solutions for digital services | 5 |
| C5 | Sitio web oficial del servicio de transporte público | Official public transport service website | 2 |
| C6 | Identidad visual y señalización del servicio | Visual identity and service signage | 4 |
| C7 | Estrategia de educación y promoción | Education and promotion strategy | 2 |

## Team

| ID | Role | Profile |
|---|---|---|
| RH1 | Sistemas inteligentes de transporte público (coordinador) | Profesor UCR |
| RH2 | Ingeniería de transporte y estadística espacial | Profesor UCR |
| RH3 | Análisis de datos e inteligencia artificial | Profesor UCR |
| RH4 | Diseño de servicios y comunicación visual | Profesor UCR |
| RH5 | Desarrollo informático | Profesional junior |
| RH6 | Desarrollo informático | Profesional junior |
| RH7 | Desarrollo informático | Profesional junior |
| RH8 | Comunicación / RRPP | Profesional junior |
| RH9 | Ingeniería eléctrica | Estudiante asistente |
| RH10 | Diseño gráfico | Estudiante asistente |
| RH11 | Derecho | Estudiante asistente |
| RH12 | Comunicación colectiva | Estudiante asistente |

## Principles & posture

- **FAIR**: published GTFS Schedule data is Findable, Accessible, Interoperable, and Reusable.
- **MDIP** (Mobility Data Interoperability Principles): data publication aligns with these recommendations.
- **Open license**: recommended license for published GTFS data is Creative Commons Attribution 3.0 (CC BY 3.0); software and documentation follow an open-source, permissive-license policy.
- **Open, public-domain data**: published transport-service data is open and public domain, with no access or use restrictions.
- **No PII, ever**: no personally identifiable information is collected, stored, or published anywhere in this system — this is a hard commitment, not a target.

## Standards

- **GTFS Schedule** — canonical static dataset format for routes, stops, and schedules.
- **GTFS Realtime Alerts** — canonical format for operational service alerts.
- **GTFS Fares** — used where fare-related interoperability is relevant (e.g. C4's data-access interfaces).
