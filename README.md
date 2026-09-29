# GenHub AI

GenHub AI is a full-stack AI creation platform built with React and Express. It brings text-generation tools, image tools, resume feedback, a creation dashboard, and a public community gallery into one application.

## Features

- Generate articles with short, medium, and long length options.
- Generate blog title ideas by keyword and category.
- Generate images from a text prompt and selected style using Pollinations.
- Remove image backgrounds and request object removal.
- Review PDF resumes and receive written feedback.
- View saved creations in a personal dashboard.
- Browse published community creations and like them.
- Authenticate users and enforce free/premium feature access with Clerk.

Some AI tools are premium-only. Image generation also requires a configured Pollinations API key and sufficient Pollen balance. Provider availability, account limits, and pricing are controlled by the respective services.

## Technology

**Client:** React, Vite, React Router, Tailwind CSS, Clerk React, Axios, React Markdown.

**Server:** Node.js, Express, Clerk Express, Neon serverless PostgreSQL, Cloudinary, Pollinations, Gemini, Multer, and `pdf-parse`.

## Project Layout

```text
client/   React frontend
server/   Express API and integrations
```

The client is served by Vite during development. The Express server provides authenticated AI and user endpoints.

## Requirements

- Node.js 20 or later
- npm
- A Clerk application
- A Neon PostgreSQL database
- Cloudinary credentials
- A Gemini API key for text generation and resume review
- A Pollinations API key for image generation

## Configuration

### Server

From the repository root, copy the server environment template:

```powershell
Copy-Item server/.env.example server/.env
```

Set the values in `server/.env`:

| Variable                | Purpose                                           |
| ----------------------- | ------------------------------------------------- |
| `PORT`                  | Express port; defaults to `3000`                  |
| `DATABASE_URL`          | Neon PostgreSQL connection string                 |
| `CLERK_SECRET_KEY`      | Clerk server authentication                       |
| `CLERK_PUBLISHABLE_KEY` | Clerk application publishable key                 |
| `GEMINI_API_KEY`        | Text generation and resume review                 |
| `POLLINATIONS_API_KEY`  | Authenticated Pollinations image generation       |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account name                           |
| `CLOUDINARY_API_Key`    | Cloudinary API key (case-sensitive variable name) |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret                             |

Keep `.env` files private. Do not commit API keys or database credentials.

### Client

Create `client/.env` with the API server URL and your Clerk publishable key:

```dotenv
VITE_BASE_URL=http://localhost:3000
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```

Use the matching Clerk publishable key for the same Clerk application configured on the server.

## Run Locally

Install dependencies for both applications:

```powershell
cd server
npm install
cd ../client
npm install
```

Start the backend in one terminal:

```powershell
cd server
npm run server
```

Start the frontend in a second terminal:

```powershell
cd client
npm run dev
```

Open the local URL printed by Vite, typically `http://localhost:5173`.

## Useful Commands

Run from `client/`:

```powershell
npm run dev       # Start Vite development server
npm run build     # Create a production build in client/dist
npm run preview   # Preview the production build
npm run lint      # Run ESLint
```

Run from `server/`:

```powershell
npm run server    # Start Express with nodemon
```

## API Overview

All routes below are mounted on the Express server. AI and user endpoints require a valid Clerk session token.

| Method | Endpoint                            | Description                                    |
| ------ | ----------------------------------- | ---------------------------------------------- |
| `POST` | `/api/ai/generate-article`          | Generate and save an article                   |
| `POST` | `/api/ai/generate-blog-title`       | Generate and save blog title ideas             |
| `POST` | `/api/ai/generate-image`            | Generate and save an image                     |
| `POST` | `/api/ai/remove-image-background`   | Upload an image and request background removal |
| `POST` | `/api/ai/remove-image-object`       | Upload an image and request object removal     |
| `POST` | `/api/ai/resume-review`             | Upload a PDF resume and receive feedback       |
| `GET`  | `/api/user/get-user-creations`      | Get the authenticated user's creations         |
| `GET`  | `/api/user/get-published-creations` | List published community creations             |
| `POST` | `/api/user/toggle-like-creation`    | Like or unlike a community creation            |
| `GET`  | `/`                                 | Backend health response                        |

Image and resume uploads use `multipart/form-data`. Resume files are limited to 5 MB. Premium access is checked by the server; hiding a client control does not grant access.

## Notes

- Generated content is stored in the `creations` table in Neon PostgreSQL.
- Generated images are stored in Cloudinary. Pollinations image responses are authenticated server-side; the Pollinations key is never sent to the browser.
- Image generation uses Pollinations' current image API and model configuration. Pollinations may require Pollen balance, and model availability or pricing may change.
- Background removal and object removal use Cloudinary transformations and require the relevant Cloudinary account features to be enabled.
- The server does not currently define a dedicated automated test script.
