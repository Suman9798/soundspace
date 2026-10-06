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

- Node.js 18 or newer and npm.
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

## API reference

The API uses a cookie named `token`. Register and login set the cookie; send it with subsequent requests. The browser frontend handles this automatically when opened from the same host and port as the API.

### Authentication

| Method | Path | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Create a listener or artist account |
| `POST` | `/api/auth/login` | Public | Sign in with email or username |
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
src/app.js              Express middleware, API mounts, and static frontend
src/server.js           Environment loading, database connection, and startup
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
