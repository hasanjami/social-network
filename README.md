# Social Network

A full-stack social platform with profiles, posts, groups and real-time messaging. The application combines a Go REST API, SQLite persistence and a Next.js interface built with React and TypeScript.

**Project type:** Team project. This repository is a portfolio copy of the shared application, with my individual contribution described below. The full application was built collaboratively.

## My contribution — Hasan Abbas

My work focused on the group system and the permissions around it:

- Implemented Go backend flows for groups, membership, invitations and join requests.
- Distinguished invitations from join requests and enforced who can accept or decline each one.
- Added public/private group behavior, membership checks and validation for invalid or duplicate actions.
- Worked on access rules for group posts and comments, including comment deletion roles.
- Updated SQL tables and migrations for group privacy, membership request types and related notifications.
- Connected group interface flows to the backend API and handled request/response behavior.
- Added backend integration tests for group permissions and request handling, and helped resolve merge conflicts during integration.

The authentication, profiles, feed, chat, events and other application features listed below describe the team's overall product. They are not a claim that I individually built every feature.

## Application features

- Account registration, sign-in and cookie-based sessions.
- Public/private profiles, following and follow requests.
- Posts with images, visibility settings, likes and comments.
- Groups with memberships, invitations, join requests and group posts.
- Group events and attendance responses.
- Notifications and private/group messaging through WebSockets.

## Stack and structure

| Layer | Technologies | Location |
| --- | --- | --- |
| Backend | Go, `net/http`, Gorilla WebSocket | `backend/` |
| Database | SQLite, SQL repositories and migrations | `backend/pkg/db/` |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS | `frontend/` |
| Development containers | Docker and Docker Compose | `docker-compose.yml` |

## Run locally

Use a Go toolchain compatible with `backend/go.mod`, Node.js 20.9 or newer, and npm. The production SQLite driver requires CGO and a C compiler.

Start the backend from its own directory so it can find the SQL migrations:

```bash
cd backend
go mod download
go run .
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000`. The API listens on `http://localhost:8080`. A fresh local SQLite database is created and migrated at startup; create your own test account in the registration page.

The frontend uses `NEXT_PUBLIC_API_URL` when provided and defaults to `http://localhost:8080`. Several media and follow calls also use the localhost address, so this copy is configured for local development.

Dockerfiles and a Compose configuration are included as an alternative development setup. When using the Compose database file mount, create an empty `backend/social.db` file before the first `docker compose up --build`.

## Group API highlights

| Endpoint | Purpose |
| --- | --- |
| `GET /api/groups` | Browse groups |
| `POST /api/groups` | Create a group |
| `POST /api/groups/{id}/invite` | Invite a user |
| `POST /api/groups/{id}/join` | Request membership |
| `POST /api/groups/{id}/accept` | Accept an invitation or join request |
| `POST /api/groups/{id}/decline` | Decline an invitation or join request |
| `GET /api/groups/{id}/members` | Retrieve group members |
| `GET /api/groups/{id}/posts` | Retrieve group posts |

Only the invited user resolves an invitation. Only the group creator resolves a join request. Viewing or adding group content requires accepted membership.

## Checks

```bash
cd backend
go test ./...
```

```bash
cd frontend
npm run lint
npm run build
```

Group integration tests live in `backend/pkg/handlers/group_handler_test.go`. They use a separate SQLite test driver and synthetic test records.

## Portfolio copy

Local uploads and generated dependencies are excluded. No account database or pre-created user sessions are included. This is an educational project; deployment configuration and production hardening require a separate review.
