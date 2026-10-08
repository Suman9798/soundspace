# Soundspace

Soundspace is a small music-sharing web app built with Express, MongoDB, and ImageKit. Listeners can browse and play tracks, and signed-in users can make private-to-their-account albums. Artist accounts can upload audio and organize their own tracks into albums.

## Features

- Register as a listener or an artist; log in and out with an HTTP-only cookie.
- Upload audio as an artist. Audio files are stored in ImageKit, while track metadata is stored in MongoDB.
- Browse and play music in the web interface.
- Create albums from available tracks.
- Keep albums visible only to the account that created them.
- Serve the frontend and API from one Express app at the same origin.

## Requirements

- Node.js 20 or newer and npm.
- MongoDB, either a local server or a MongoDB Atlas database.
- An ImageKit account and private API key to upload tracks.

## Run locally

1. Clone the repository and enter the project folder:

   ```bash
   git clone https://github.com/Suman9798/soundspace.git
   cd soundspace
   ```

   If the repository is private, sign in to GitHub and make sure your account has access.

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create your local environment file:

   ```bash
   cp .env.example .env
   ```

   On Windows PowerShell, use `Copy-Item .env.example .env` instead.

4. Edit `.env` and set the configuration values:

   ```dotenv
   PORT=3000
   MONGO_URI=mongodb://127.0.0.1:27017/soundspace
   JWT_SECRET=replace_with_a_long_random_secret
   IMAGEKIT_PRIVATE_KEY=private_your_imagekit_private_key
   ```

   For MongoDB Atlas, replace `MONGO_URI` with your Atlas connection string. Make sure the database user and network access are configured in Atlas. Keep `.env` private; it is excluded from Git.

   `IMAGEKIT_PRIVATE_KEY` is required for artist uploads. The app can start without it, but uploads will fail until it is configured.

5. Start the app:

   ```bash
   npm start
   ```

6. Open [http://localhost:3000](http://localhost:3000).

The server waits for MongoDB to connect before it begins listening. To use another port, set `PORT` in `.env`.

## Account roles

| Capability | Listener | Artist |
|---|---:|---:|
| Browse and play tracks | All tracks | Own tracks |
| Upload audio | — | Yes |
| Create albums | Yes, from tracks in the catalog | Yes, from own tracks |
| View albums | Own albums | Own albums |

Albums are scoped to the account that created them. Listener accounts can create collections from the available catalog; artist accounts can create albums from tracks they uploaded.

## Deploy to Vercel

Vercel serves the files in `public/` and runs the Express API as a serverless function. MongoDB and ImageKit remain external services; configure their credentials in Vercel rather than committing them.

1. Push this repository to GitHub, then sign in to [Vercel](https://vercel.com/) and choose **Add New → Project**.
2. Import `Suman9798/soundspace`. Keep the detected/default build settings; this project does not need a separate build command or output directory.
3. Add these environment variables under the project settings. Select Production, Preview, and Development as needed:

   | Variable | Value |
   |---|---|
   | `MONGO_URI` | Your MongoDB Atlas connection string |
   | `JWT_SECRET` | A long, random secret used to sign login tokens |
   | `IMAGEKIT_PRIVATE_KEY` | Your ImageKit private key |
   | `GOOGLE_CLIENT_ID` | OAuth 2.0 Web client ID for Google Identity Services |
   | `SMTP_USER` | Gmail address used to send verification emails |
   | `SMTP_APP_PASSWORD` | Google App Password for that Gmail account |
   | `SMTP_HOST` | SMTP host, usually `smtp.gmail.com` |
   | `SMTP_PORT` | SMTP port, usually `465` |
   | `SMTP_FROM` | Optional sender display name and address |

   `PORT` is only used for local development. Vercel supplies the production runtime settings. Do not add `.env` to Git or paste secret values into source files.

4. In MongoDB Atlas, allow connections from Vercel and use a database user with a strong password. Atlas may require `0.0.0.0/0` when using Vercel's changing outbound IPs; use a dedicated least-privilege database user and never expose the connection string publicly.
5. In Google Cloud Console, configure the OAuth consent screen and create a Web application OAuth client. Add your local app origin (for example `http://localhost:3000`) and deployed app origin (for example `https://your-project.vercel.app`) as authorized JavaScript origins. Set its client ID as `GOOGLE_CLIENT_ID` in your local `.env` and Vercel settings. See [Google's client ID setup guide](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).
6. For password registration email codes, use a Gmail account with 2-Step Verification enabled and create an App Password. Set `SMTP_USER` and `SMTP_APP_PASSWORD` locally and in Vercel. Google requires 2-Step Verification for App Passwords; some managed accounts may not permit them. See [Google's App Password instructions](https://support.google.com/accounts/answer/185833).
7. Click **Deploy**. After it finishes, open the generated `.vercel.app` URL, register an account or sign in with Google, and try the music and album pages. Artist uploads need the ImageKit private key configured.

Vercel Functions currently accept request bodies up to 4.5 MB. Since this app sends audio through its API and the local upload limit is 25 MB, audio files above Vercel's request limit will fail with HTTP 413. Larger uploads need a direct browser-to-ImageKit upload flow.

Each new push to the connected GitHub branch triggers a deployment. Configure the Vercel environment variables before the first deployment; changing them requires a new deployment to take effect.

## API reference

The API uses a cookie named `token`. Register and login set the cookie; send it with subsequent requests. The browser frontend handles this automatically when opened from the same host and port as the API.

### Authentication

| Method | Path | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Create a listener or artist account |
| `POST` | `/api/auth/login` | Public | Sign in with email or username |
| `POST` | `/api/auth/email-otp/send` | Public | Send an email verification code for password registration |
| `POST` | `/api/auth/email-otp/verify` | Public | Verify the registration email code |
| `POST` | `/api/auth/google` | Public | Verify a Google ID token and sign in (creates a listener account when needed) |
| `GET` | `/api/auth/google/config` | Public | Return the configured Google web client ID |
| `GET` | `/api/auth/me` | Signed in | Return the current account |
| `POST` | `/api/auth/logout` | Public | Clear the login cookie |

Register with JSON:

```json
{
  "username": "listener1",
  "email": "listener@example.com",
  "password": "use-a-password-at-least-8-characters",
  "role": "user"
}
```

Set `role` to `artist` to create an artist account. If omitted, the role defaults to `user`.

Login with either email or username:

```json
{
  "email": "listener@example.com",
  "password": "use-a-password-at-least-8-characters"
}
```

### Music and albums

| Method | Path | Access | Description |
|---|---|---|---|
| `POST` | `/api/music/upload` | Artist | Upload one audio file and save its track record |
| `POST` | `/api/music/album` | Signed in | Create an account-owned album from track IDs |
| `GET` | `/api/music` | Signed in | List tracks; artists receive only their tracks |
| `GET` | `/api/music/albums` | Signed in | List the current account’s albums |
| `GET` | `/api/music/albums/:albumId` | Signed in | Get one of the current account’s albums |

The upload request uses `multipart/form-data` with a text field named `title` and an audio file field named `music`. Files are limited to 25 MB. The original misspelled path `/api/music/uplaod` is also kept as a compatibility alias; use `/api/music/upload` for new clients.

Create an album with JSON. `musics` is an array of MongoDB music document IDs; it can be empty:

```json
{
  "title": "Late Night Finds",
  "musics": ["64f0a12bc345678901234567"]
}
```

Listeners may use tracks in the catalog. Artists may only use tracks they uploaded. Album list and detail endpoints only return albums owned by the signed-in account.

## Project layout

```text
public/                 Frontend HTML, CSS, JavaScript, and favicon
src/controllers/        Authentication and music request handlers
src/db/                 MongoDB connection
src/middlewares/        JWT cookie authentication and role checks
src/models/             Mongoose user, music, and album models
src/routes/             API route definitions
src/services/           ImageKit upload integration
src/app.js              Express middleware, API mounts, and Vercel app export
src/local-server.js     Environment loading, database connection, and local startup
```

## Troubleshooting

- **MongoDB connection fails:** Check `MONGO_URI`, database credentials, Atlas network access, and whether MongoDB is running.
- **Upload returns an error:** Confirm the account is an artist, `IMAGEKIT_PRIVATE_KEY` is correct, the file is audio and under 25 MB, and the server can reach ImageKit. More detail is logged in the server terminal.
- **API returns `401`:** Sign in again in the same browser origin where Soundspace is open. Cookies are not shared between `localhost` and `127.0.0.1`.
- **API returns `403` on upload:** The signed-in account needs the `artist` role.
- **Album is missing:** Albums are private to their creator account; sign in with the account that created it.

## Security notes

- Never commit `.env`, private keys, database passwords, or access tokens.
- `.env`, `.aws`, and `node_modules` are ignored by Git. Copy `.env.example` to create your own local configuration.
- In production, serve the app over HTTPS so the authentication cookie can use the `Secure` flag.
