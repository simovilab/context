# GTFS Realtime Reference (synthetic fixture)

GTFS Realtime is a feed specification that allows public transportation
agencies to provide real-time updates about their fleet to application
developers. It is an extension to GTFS (General Transit Feed Specification),
an open data format for public transportation schedules and associated
geographic information.

GTFS Realtime is based on Protocol Buffers, a language and platform neutral
mechanism for serializing structured data. The specification consists of
three main feeds: trip updates, service alerts, and vehicle positions.

Trip updates communicate arrival and departure predictions for trips that
are underway. Predictions can be provided at the level of the entire trip
or for specific stops along that trip.

Service alerts communicate information about unforeseen events affecting a
transit network, such as delays, detours, or service interruptions. Alerts
can apply to a route, a stop, or an entire agency.

Vehicle positions communicate information about vehicles including location,
speed, and congestion level. This feed is used by riders to know where a
bus or train currently is, which supports live public transport information
displays at stations and inside companion mobile applications.

Public transport information systems built on top of GTFS Realtime combine
the static schedule with these three live feeds so that a rider can see both
the planned schedule and how service is actually running right now.
