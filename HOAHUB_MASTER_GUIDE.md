# HOAHub Master Engineering Guide

**Version:** 1.1

**Product:** HOAHub – AI Powered Community Operating System

**Author:** Lowie Sevilla

**Project Type:** Multi-Tenant SaaS Platform

**Technology Stack**

- Next.js 15
- React 19
- TypeScript
- Prisma ORM
- MySQL
- TailwindCSS
- Hostinger Deployment
- GitHub Actions CI/CD

---

# Purpose

This document is the official engineering, architecture, development, deployment, security, and product-governance guide for HOAHub.

Every developer, AI coding assistant (Codex), and future contributor MUST follow this guide.

No implementation should violate the standards defined here.

This guide is the governing source for engineering principles. Specialized authoritative documents define approved scope and operational requirements without overriding this guide.

# Authoritative Product Delivery Documents

- [HOAHub Commercial MVP and Pilot Release Standard](docs/product/HOAHUB_COMMERCIAL_MVP.md) — defines the approved pilot scope, end-to-end workflows, release gates, success metrics, and UAT evidence requirements.
- [HOAHub Product Roadmap](HOAHUB_PRODUCT_ROADMAP.md) — describes product direction and planned phases.
- GitHub Issues and Projects — track executable delivery work, defects, priorities, ownership, and status.

When documents conflict, raise a GitHub issue and obtain product-owner approval before implementation. Security, tenant-isolation, finance-integrity, privacy, and restore requirements may not be weakened through an undocumented exception.
