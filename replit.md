# OperatorOS

## Overview

OperatorOS is an AI-native Cloud Development Environment (CDE) and SaaS platform designed to manage application workspaces, services, and deployments. It provides a comprehensive ecosystem for developers, offering tools for project management, task tracking, note-taking, and activity monitoring, alongside a powerful CDE Operator Shell for terminal access, process management, and automation. The platform aims to streamline the development lifecycle, enhance collaboration, and integrate AI-powered capabilities to boost productivity for individual developers and teams.

## User Preferences

I want iterative development.
Ask before making major changes.
I prefer to be given all the information before you make any changes.
I prefer detailed explanations.
I prefer simple language.
I like functional programming.

## System Architecture

OperatorOS is built as a pnpm monorepo with a clear separation of concerns, comprising a SaaS Platform and a CDE Operator Shell.

**UI/UX Decisions:**
The web interface (Next.js) uses state-based routing and inline styles with a dark-first theme for a consistent and modern user experience. The layout features a collapsible sidebar navigation, user info, and plan badges, providing intuitive access to different sections.

**Technical Implementations:**
- **API (Fastify):** The control plane API handles all backend logic, including authentication, SaaS CRUD operations (workspaces, projects, tasks, notes, activity), admin functionalities, and billing. It uses Drizzle ORM for database interactions.
- **Web (Next.js):** The frontend provides a rich GUI for the SaaS platform, consuming data from the API. It manages user authentication via JWT stored in localStorage.
- **Runner Gateway:** A standalone service responsible for executing code and managing runners, supporting local, Docker, and Kubernetes environments. It includes a safety module to prevent unsafe command execution.
- **AI Agent:** An integrated AI agent loop, powered by GPT-4o, assists with development tasks and automation.
- **Publish Assistant:** A module facilitating a structured pipeline for analyzing, planning, generating artifacts, and proofing.

**Feature Specifications:**
- **Authentication & Authorization:** Implements email/password authentication with bcrypt and JWTs. It includes comprehensive authorization middleware for role-based access control, subscription plan gating, and usage limit enforcement.
- **Subscription & Feature Gating:** A flexible subscription system with Starter, Pro, and Elite plans, defined by a centralized configuration. Features and resource limits are enforced on both backend and frontend, with a sophisticated downgrade flow to prevent data loss.
- **Admin Control Center:** A dedicated administrative interface for managing users, monitoring metrics, auditing actions, and handling billing events.
- **Core Workspace Management:** Provides endpoints for creating, listing, and managing workspaces, including process, service, and automation rule management.

**System Design Choices:**
- **Monorepo Structure:** Facilitates shared code (SDK) and consistent development across different services.
- **Database (PostgreSQL):** Utilizes PostgreSQL with Drizzle ORM for structured data storage, including SaaS-specific tables (users, subscriptions, workspaces, projects, tasks, notes) and CDE-specific tables (workspace processes, services, automation rules).
- **Environment Variables:** Extensive use of environment variables for configuration, including database connections, session secrets, API URLs, admin credentials, and Stripe integration keys.
- **Security:** Employs multi-tenant authorization, ownership checks, input validation, and a command denylist for CDE shell to ensure a secure environment.

## External Dependencies

- **PostgreSQL:** Primary database for all application data.
- **Stripe:** Integrated for subscription management, billing, and payment processing (optional, activated via environment variables).
- **OpenAI API:** Used by the AI Agent for AI-powered functionalities (requires `OPENAI_API_KEY`).
- **Fastify:** Web framework for the API service.
- **Next.js:** React framework for the web frontend.
- **Drizzle ORM:** TypeScript ORM for interacting with PostgreSQL.
- **pnpm:** Monorepo package manager.
- **bcrypt:** For password hashing.
- **jsonwebtoken (JWT):** For user authentication tokens.