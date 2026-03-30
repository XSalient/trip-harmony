# Harmony - Project TODO

## Core Infrastructure
- [x] Database schema design (users, groups, trips, Travel DNA, votes, budget, notifications)
- [x] Backend tRPC routers for all features
- [x] Frontend theming and mobile-first layout

## Feature: Travel DNA Quiz
- [x] Personality-based questionnaire (budget comfort, social energy, adventure level, etc.)
- [x] Travel DNA profile storage and display
- [x] Group DNA compatibility analysis

## Feature: Group Creation & Management
- [x] Create trip groups with name, description
- [x] Invite members via shareable link
- [x] Track participation status (pending, accepted, declined)
- [x] Role assignment (organizer, member)

## Feature: Multi-Phase Trip Planning Workflow
- [x] Phase 1: Date selection with availability heatmap
- [x] Phase 2: Destination vibe board with visual preference voting
- [x] Phase 3: Accommodation hub with filtering and comparison

## Feature: Active Referee Engine
- [x] AI-powered conflict detection (budget gaps, preference conflicts)
- [x] Compromise suggestions based on Travel DNA profiles
- [x] Witty nudges and mediation messages

## Feature: Budget Guardian
- [x] Real-time budget tracking with per-person breakdown
- [x] Currency conversion support
- [x] Comfort-level warnings when proposals exceed thresholds

## Feature: Voting System
- [x] Vote on accommodations and activities (Love / Fine / Veto)
- [x] Weighted preferences based on roles
- [x] AI consensus recommendations

## Feature: Trip Dashboard
- [x] Centralized decision status view
- [x] Pending votes summary
- [x] Budget summary widget
- [x] Timeline progress tracker

## Feature: Real-Time Notifications
- [x] New proposal alerts
- [x] Vote request notifications
- [x] Budget change alerts
- [x] Consensus achievement notifications

## Polish & Testing
- [x] Vitest unit tests for backend
- [x] Mobile responsiveness polish
- [x] Final checkpoint and delivery

## Enhancement: Accommodation URL Auto-Fill
- [ ] Allow pasting a URL at the top of accommodation form
- [ ] Auto-extract name, description, price, images, amenities from URL via LLM
- [ ] Pre-fill form fields so users don't need to enter everything manually

## Enhancement: Date Proposal Display
- [ ] Show day names (e.g., "Tue - Sun") for date ranges
- [ ] Show nights count (e.g., "5 nights")

## Enhancement: Natural Language Proposals
- [ ] Allow entering date proposals in plain language (e.g., "any weekend in June", "weekdays Tue-Thu in April")
- [ ] LLM parses natural language into structured date ranges
- [ ] Allow entering accommodation requirements in natural language
- [ ] LLM maps natural language to structured attributes/preferences

## Enhancement: Detailed Preference/Requirement System
- [ ] Accommodation preferences: single beds, double beds, toilets, bathrooms, microwave, parking, etc.
- [ ] Smart attribute system that handles 1000s of possible attributes via LLM mapping
- [ ] Store preferences per member per trip
- [ ] Match preferences against proposals

## Enhancement: Requirement Match Dashboard
- [ ] Show how many requirements are met/unmet per proposal
- [ ] Dashboard view for easy access to requirement fulfillment status
- [ ] Visual indicators (met/unmet/partial) for each member's requirements

## Enhancement: Deletion & Unlock Controls
- [ ] Allow deletion of self-entered proposals (dates, destinations, accommodations)
- [ ] Allow organizer to unlock finalized dates/selections
- [ ] Confirmation dialogs for destructive actions
