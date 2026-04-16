# welplan2

`welplan2` provides TypeScript clients and a web app for browsing cafeteria menus from Samsung Welstory Plus and Shinsegae Food PlanEAT Choice.

The repository contains a SvelteKit web app, shared TypeScript models, and vendor-specific clients used to fetch menu, nutrition, and restaurant data.

## Features

- Aggregates restaurant and meal-time data from Welstory Plus and PlanEAT Choice.
- Supports gallery, take-in, and take-out menu views.
- Calculates and customizes a nutrition-based `P-Score` in the web UI.
- Caches restaurants, meal times, menus, and menu details in SQLite.
- Periodically prefetches menus for user-selected restaurants.
- Builds and publishes a Docker image to GHCR.
- Publishes client packages to the GitHub Packages npm registry.

## Repository Layout

| Path                  | Package                             | Purpose                                                   |
| --------------------- | ----------------------------------- | --------------------------------------------------------- |
| `model`               | `@pmh-only/welplan2-model`          | Shared cafeteria domain types used across the repository. |
| `impl/welstory_plus`  | `@pmh-only/welplan2-welstory-plus`  | Welstory Plus API client used by the web app.             |
| `impl/planeat_choice` | `@pmh-only/welplan2-planeat-choice` | PlanEAT Choice API client used by the web app.            |
| `webapp`              | `@pmh-only/welplan2-webapp`         | SvelteKit application for browsing menus.                 |

## Requirements

- Node.js 22 or newer recommended.
- `pnpm` via Corepack.
- Welstory credentials if you want Welstory data.

## Environment Variables

| Variable             | Required     | Default        | Description                                                  |
| -------------------- | ------------ | -------------- | ------------------------------------------------------------ |
| `WELSTORY_USERNAME`  | For Welstory | none           | Welstory Plus login ID.                                      |
| `WELSTORY_PASSWORD`  | For Welstory | none           | Welstory Plus password.                                      |
| `WELSTORY_DEVICE_ID` | No           | generated UUID | Optional device identifier sent to Welstory.                 |
| `DB_PATH`            | No           | `cache.db`     | SQLite database path used by the web app and Drizzle config. |
| `HOST`               | No           | `0.0.0.0`      | Host used by the production Node server.                     |
| `PORT`               | No           | `3000`         | Port used by the production Node server.                     |

PlanEAT Choice requests do not currently require credentials.

## Local Development

Install dependencies:

```bash
corepack enable
pnpm install
```

Build the TypeScript libraries:

```bash
pnpm build
```

Start the web app in development mode:

```bash
pnpm --filter @pmh-only/welplan2-webapp dev
```

Build the production web app bundle:

```bash
pnpm --filter @pmh-only/welplan2-webapp build
```

Run the production server locally:

```bash
pnpm --filter @pmh-only/welplan2-webapp start
```

## Web App Routes

- `/` or `/gallery`: gallery-style menu view.
- `/takein`: redirect to the current take-in menu.
- `/takeout`: redirect to the current take-out menu.
- `/restaurants`: manage the restaurant list stored in the `welplan_restaurants` cookie.
- `/settings`: tune `P-Score` weights and inspect or clear the server cache.
- `/api/cache/status`: inspect cache counts.
- `/api/cache/clear`: clear cached data.

## Package Usage

### GitHub Packages setup

To install the published packages, configure npm for the `@pmh-only` scope:

```ini
@pmh-only:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

### Install `@pmh-only/welplan2-welstory-plus`

```bash
npm install @pmh-only/welplan2-welstory-plus
```

### Use `@pmh-only/welplan2-welstory-plus`

```ts
import { WelstoryPlusClient } from '@pmh-only/welplan2-welstory-plus'

const client = new WelstoryPlusClient({
  username: process.env.WELSTORY_USERNAME,
  password: process.env.WELSTORY_PASSWORD
})

const restaurants = await client.getRestaurants()
const mealTimes = await client.getMealTimes(restaurants[0])
const menus = await client.getMenus(restaurants[0], '20260416', mealTimes[0].id)
```

### Install `@pmh-only/welplan2-planeat-choice`

```bash
npm install @pmh-only/welplan2-planeat-choice
```

### Use `@pmh-only/welplan2-planeat-choice`

```ts
import { PlaneatChoiceClient } from '@pmh-only/welplan2-planeat-choice'

const client = new PlaneatChoiceClient()
const restaurants = await client.getRestaurants()
const mealTimes = await client.getMealTimes(restaurants[0])
const menus = await client.getMenus(restaurants[0], '20260416', mealTimes[0].id)
```

### `@pmh-only/welplan2-model`

Shared types for restaurants, meal times, menus, nutrition, and the `CafeteriaClient` contract.

```ts
import type { CafeteriaClient, MealTime, Menu, Restaurant } from '@pmh-only/welplan2-model'
```

## Docker

Build the image:

```bash
docker build -t welplan2 .
```

Run it:

```bash
docker run --rm \
  -p 3000:3000 \
  -e WELSTORY_USERNAME=your-id \
  -e WELSTORY_PASSWORD=your-password \
  -v welplan2-data:/data \
  welplan2
```

The container stores its SQLite database at `/data/cache.db` by default.

## CI/CD

### Docker image

`.github/workflows/docker-webapp.yml` builds amd64 and arm64 images and publishes them to:

- `ghcr.io/pmh-only/welplan2:sha-<commit>`
- `ghcr.io/pmh-only/welplan2:latest` on the default branch

### Package registry

Published packages are stored in the GitHub Packages npm registry under the `@pmh-only` scope.

### Package release

`.github/workflows/release-packages.yml` publishes these packages to GitHub Packages:

- `@pmh-only/welplan2-model`
- `@pmh-only/welplan2-welstory-plus`
- `@pmh-only/welplan2-planeat-choice`

Tag-triggered release flow:

1. Update the target package version in its `package.json`.
2. Push the change to `main`.
3. Create and push the matching tag:
4. `model-v<version>` for `@pmh-only/welplan2-model`
5. `welstory-plus-v<version>` for `@pmh-only/welplan2-welstory-plus`
6. `planeat-choice-v<version>` for `@pmh-only/welplan2-planeat-choice`
7. The workflow validates that the tag version matches the package version and publishes the selected package.

You can also run the workflow manually from the Actions tab and choose the package to publish.

Release note:

`@pmh-only/welplan2-welstory-plus` and `@pmh-only/welplan2-planeat-choice` depend on `@pmh-only/welplan2-model`. If the model package version changes, publish `@pmh-only/welplan2-model` first so the client package dependency resolves in GitHub Packages.

GitHub Packages note:

The workflow publishes with the repository `GITHUB_TOKEN`. For installs outside Actions, use a GitHub token with package read access. After the first publish, verify package visibility in GitHub Packages if you want public consumption.

## Verification

Useful repository commands:

```bash
pnpm build
pnpm lint
pnpm --filter @pmh-only/welplan2-webapp build
```

The repository currently does not define an automated test suite.
