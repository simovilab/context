# Principios de Gobernanza de Datos para el Sector Público

Un modelo de gobernanza de datos define quién decide qué significa un
dato, quién puede modificarlo y cómo se garantiza su calidad a lo largo
del tiempo. En sistemas públicos donde varias instituciones producen o
custodian partes de un mismo conjunto de datos —como suele ocurrir en el
transporte público, donde un ente regulador, un registro de operadores y
administradores de infraestructura manejan piezas distintas de la
información— la gobernanza es lo que evita que el conjunto se vuelva
incoherente.

## Roles fundamentales

Marcos de referencia como el **DAMA-DMBOK** (Data Management Body of
Knowledge) distinguen roles que resultan directamente aplicables:

- **Propietario del dato (Data Owner)**: la institución con autoridad y
  responsabilidad final sobre un dominio de datos determinado.
- **Custodio funcional (Data Steward)**: responsable operativo de la
  calidad, definiciones y proceso de cambio de un conjunto de datos, en
  representación del propietario.
- **Custodio técnico (Data Custodian)**: la función técnica que
  almacena, asegura y pone a disposición los datos, distinta de quién
  decide su contenido.

Separar estos roles evita que un equipo técnico tome, sin mandato,
decisiones que corresponden a la autoridad operativa o regulatoria.

## Procesos de gobernanza recomendados

- **Flujo de actualización y validación**: quién puede proponer un
  cambio, quién lo revisa, y qué validaciones automáticas (esquema,
  integridad referencial) deben aprobarse antes de publicar.
- **Versionado y comunicación de cambios**: fechar y documentar cada
  actualización para que los consumidores del dato puedan rastrear qué
  cambió y cuándo.
- **Resolución de conflictos**: un mecanismo explícito para cuando dos
  instituciones aportan datos contradictorios sobre un mismo elemento.
- **Revisión periódica**: una cadencia recurrente para evaluar tanto la
  calidad del dato como la efectividad del propio modelo de gobernanza.

## Coordinación interinstitucional

Cuando varias instituciones públicas son fuente de partes distintas del
mismo conjunto de datos, un modelo de gobernanza efectivo suele
incorporar un comité de coordinación con representación de cada
institución, junto con una secretaría técnica única encargada de la
consolidación, de modo que ninguna institución se convierta en autoridad
de facto sin mandato explícito.

**Fuente**: DAMA International, *DAMA-DMBOK: Data Management Body of
Knowledge*, 2ª edición — síntesis de principios de gobernanza y
custodia de datos (marco de referencia público ampliamente citado).
