

> Drupal 11 multisite project template for EPS different vericals, using Lando and Composer.

## 📁 Overview

This repository hosts a Drupal 11 multisite codebase. It supports multiple domains/subdomains from a single codebase, with separate configurations, files, and databases per site.
Drupal 11

MySQL 8.0

PHP >= 8.3

Multiple domains (multisite)

Drush & Composer

  ### 🔐 Compliance

    - ✅ Section 508 Accessibility
    - ✅ HTTPS-by-default (HSTS ready)
    - ✅ Follows U.S. Web Design System (USWDS)
    - ✅ Configurable Content Security Policy (CSP)
    - ✅ Supports Drupal 11 security best practices

## 🚀 Project Setup

  ### 🧰 Prerequisites

    - [Docker Desktop](https://www.docker.com/products/docker-desktop)
    - [Lando](https://docs.lando.dev/core/v3/#install)
    - [Composer](https://getcomposer.org/)
    - [Drush](https://www.drush.org/) (optional but recommended)

🗂️ Directory Structure
    
    web/sites/main/
    web/sites/news/
    web/sites/data/

  Shared modules/themes live in web/modules/custom, web/themes/custom

🔐 Security
  Admin usernames are non-default
  HTTPS enforced on all routes (HSTS headers enabled in production).

