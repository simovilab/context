# Data Principles

SIMOVI Lab is committed to implementing the FAIR Principles as a foundation for responsible research data management and open science. We strive to ensure that all published data are Findable, Accessible, Interoperable, and Reusable, following international best practices and community standards.

## FAIR Principles

> [!NOTE]
> Copyright © 2025 GO FAIR. All Rights Reserved.

From [go-fair.org/fair-principles/](https://www.go-fair.org/fair-principles/):

> The principles emphasize machine-actionability (i.e., the capacity of computational systems to find, access, interoperate, and reuse data with none or minimal human intervention) because humans increasingly rely on computational support to deal with data as a result of the increase in volume, complexity, and creation speed of data.

### Findable

The first step in (re)using data is to find them. Metadata and data should be easy to find for both humans and computers. Machine-readable metadata are essential for automatic discovery of datasets and services, so this is an essential component of the [FAIRification process](https://www.go-fair.org/fair-principles/fairification-process/).

- [F1.](https://www.go-fair.org/fair-principles/fair-data-principles-explained/f1-meta-data-assigned-globally-unique-persistent-identifiers/) (Meta)data are assigned a globally unique and persistent identifier
- [F2.](https://www.go-fair.org/fair-principles/fair-data-principles-explained/f2-data-described-rich-metadata/) Data are described with rich metadata (defined by R1 below)
- [F3.](https://www.go-fair.org/fair-principles/f3-metadata-clearly-explicitly-include-identifier-data-describe/) Metadata clearly and explicitly include the identifier of the data they describe
- [F4.](https://www.go-fair.org/fair-principles/f4-metadata-registered-indexed-searchable-resource/) (Meta)data are registered or indexed in a searchable resource

### Accessible

Once the user finds the required data, she/he/they need to know how they can be accessed, possibly including authentication and authorisation.

- [A1.](https://www.go-fair.org/fair-principles/542-2/) (Meta)data are retrievable by their identifier using a standardised communications protocol
  - [A1.1](https://www.go-fair.org/fair-principles/a1-1-protocol-open-free-universally-implementable/) The protocol is open, free, and universally implementable
  - [A1.2](https://www.go-fair.org/fair-principles/a1-2-protocol-allows-authentication-authorisation-required/) The protocol allows for an authentication and authorisation procedure, where necessary
- [A2.](https://www.go-fair.org/fair-principles/a2-metadata-accessible-even-data-no-longer-available/) Metadata are accessible, even when the data are no longer available

### Interoperable

The data usually need to be integrated with other data. In addition, the data need to interoperate with applications or workflows for analysis, storage, and processing.

- [I1.](https://www.go-fair.org/fair-principles/i1-metadata-use-formal-accessible-shared-broadly-applicable-language-knowledge-representation/) (Meta)data use a formal, accessible, shared, and broadly applicable language for knowledge representation.
- [I2.](https://www.go-fair.org/fair-principles/i2-metadata-use-vocabularies-follow-fair-principles/) (Meta)data use vocabularies that follow FAIR principles
- [I3.](https://www.go-fair.org/fair-principles/i3-metadata-include-qualified-references-metadata/) (Meta)data include qualified references to other (meta)data

### Reusable

The ultimate goal of FAIR is to optimise the reuse of data. To achieve this, metadata and data should be well-described so that they can be replicated and/or combined in different settings.

- [R1.](https://www.go-fair.org/fair-principles/r1-metadata-richly-described-plurality-accurate-relevant-attributes/) (Meta)data are richly described with a plurality of accurate and relevant attributes
  - [R1.1.](https://www.go-fair.org/fair-principles/r1-1-metadata-released-clear-accessible-data-usage-license/) (Meta)data are released with a clear and accessible data usage license
  - [R1.2.](https://www.go-fair.org/fair-principles/r1-2-metadata-associated-detailed-provenance/) (Meta)data are associated with detailed provenance
    - [R1.3.](https://www.go-fair.org/fair-principles/r1-3-metadata-meet-domain-relevant-community-standards/) (Meta)data meet domain-relevant community standards

The principles refer to three types of entities: data (or any digital object), metadata (information about that digital object), and infrastructure. For instance, principle F4 defines that both metadata and data are registered or indexed in a searchable resource (the infrastructure component).
