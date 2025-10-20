# IT-Project-25/26 - Ticket Masala

![Logo](docs/visual/logo-green.png)

## Informatie

- Wie : Charlotte Schröer, Maarten Görtz, Wito De Schrijver, Stef Van Impe en Juan Benjumea
- Concept : Ticketing, Case en Project Management met AI ondersteuning
- Technologieen: Fullstack .NET en Python

## Basis structuur

Light-weight beheersysteem met AI-integratie als rode draad in alle lagen.

Dashboard-gedreven ontwerp waarbij de gebruiker (klant, stafflid) per rol de relevante informatie ziet. Er zijn drie views: ticketing, case en project management.

![ERD-model](docs/architecture/erd-dark.drawio.png)

### Lagen

- Ticketing: vormt de toegangspoort voor het aanmaken van nieuwe tickets, cases en projecten.

- Case Management: groepeert één of meerdere tickets (parent-child). Hier volgt men de voortgang, communicatie en details van een dossier op.

- Project Management: bundelt één of meerdere cases (bijvoorbeeld van verschillende klanten) tot een project. Hier beheert men de algemene voortgang, deadlines en mijlpalen.

- AI-helper: biedt contextbewuste ondersteuning in alle lagen door historische gegevens te analyseren en voorstellen te doen voor acties, toewijzingen en samenvattingen. De AI gebruikt lokale of cloudmodellen voor verklaarbaarheid en automatisering.

![Basis UI](docs/visual/basic-UI.png)

### Interconnectie van lagen

Ticketing → Case Management: elke ticket wordt automatisch een case met AI-aanbevelingen voor opvolging

Case Management → Project Management: cases worden geaggregeerd tot projectoverzicht

AI Helper → Alle lagen: real-time suggesties bij aanmaak, opvolging, planning en rapportage

## Roadmap

Algemeen

- [ ] Role based authentication
- [ ] Notificaties en berichten
- [ ] Discussies en comments

Ticketing interface

- [ ] Ticket aanmaakfunctie : form bij klant, medewerker, automatisch.
- [ ] Aanpassing ticket : individueel en batch
- [ ] Filter- en zoekfunctie
- [ ] Quick actions

Case management interface

- [ ] Case Detail view
- [ ] Linken, groeperen van tickets
- [ ] Notities
- [ ] Berichten
- [ ] Documentatie en bijlagen bij case
- [ ] Form / document generation

Project management interface  

- [ ] Fases en mijlpalen
- [ ] Teamleden en verantwoordelijkheden
- [ ] Kalender
- [ ] Analytics

AI Helper

- [ ] Similariteitszoektocht en contextuele vergelijking eerdere cases
- [ ] AI suggestie automatische toewijzing
- [ ] Explain case en context generatie
- [ ] Generatie oplossingen, antwoorden, rapporten
- [ ] Alerts en insights
- [ ] Planning optimalisatie suggesties

## Functionele en technische vereisten

- Frontend : Blazor WebAssembly (.NET 8)
- Mobile first en responsive design
- Backend : ASP .NET Core Web API
- AI: Python microservice (Ollama / Open AI / local LLM integration)
- Deployment: Azure + Docker