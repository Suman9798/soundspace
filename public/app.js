const state = {
  user: null,
  view: "home",
  tracks: [],
  albums: [],
  recentUploads: [],
  authMode: "login",
  currentAlbum: null,
  returnView: "home",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const content = $("#content");
const audio = $("#audio");
const googleIdentityReady = new Promise((resolve) => {
  const script = $("#googleIdentityScript");
  if (window.google?.accounts?.id) return resolve();
  script?.addEventListener("load", resolve, { once: true });
  script?.addEventListener("error", resolve, { once: true });
  setTimeout(resolve, 8000);
});

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

let toastTimer;
function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 3200);
}

function setConnection(ready) {
  const label = $("#connectionText");
  label.textContent = ready ? "App ready" : "Offline";
  label.parentElement.classList.toggle("online", ready);
}

function titleCase(value = "") {
  return value ? value[0].toUpperCase() + value.slice(1) : "";
}

function artistTracks() {
  if (!state.user) return state.recentUploads;
  const ownTracks = state.tracks.filter((track) => {
    const artistId = typeof track.artist === "object" ? track.artist?._id : track.artist;
    return String(artistId) === String(state.user.id);
  });
  const byId = new Map();
  [...ownTracks, ...state.recentUploads].forEach((track) => byId.set(String(track._id || track.id), track));
  return [...byId.values()];
}

function heroTemplate() {
  const signedIn = Boolean(state.user);
  const artist = state.user?.role === "artist";
  return `<section class="hero">
    <div class="hero-art" aria-hidden="true"></div>
    <div class="hero-copy">
      <p class="eyebrow">A GOOD DAY STARTS WITH A GOOD TRACK</p>
      <h1>${signedIn ? `Welcome back, ${escapeHTML(state.user.username)}.` : "A little space for the music you love."}</h1>
      <p>${signedIn ? (artist ? "Your artist space is ready. Share a track or put your music together in an album." : "Settle in, find a favorite, and let the next track take it from here.") : "Discover the tracks and albums in your collection. Sign in to press play."}</p>
      <div class="hero-actions">${signedIn
        ? `<button class="button button-primary" data-view="library">Browse music</button>${artist ? `<button class="button button-outline" data-view="studio">Artist studio</button>` : `<button class="button button-outline" data-view="studio">Create an album</button><button class="button button-outline" data-view="albums">Explore albums</button>`}`
        : `<button class="button button-primary" data-open-auth="register">Get started</button><button class="button button-outline" data-open-auth="login">I have an account</button>`}</div>
    </div>
  </section>`;
}

function trackRows(tracks) {
  if (!tracks.length) return `<div class="empty-state"><div class="empty-icon">♫</div><strong>No tracks just yet</strong><p>When artists share music, it will be waiting here for you.</p></div>`;
  return `<div class="track-list"><div class="track-head"><span>#</span><span>Title</span><span class="album-col">Artist</span><span class="track-duration">Play</span></div>${tracks.map((track, index) => `
    <div class="track-row">
      <span class="track-number">${String(index + 1).padStart(2, "0")}</span>
      <div class="track-main"><div class="cover-art">♫</div><div class="track-name"><strong>${escapeHTML(track.title)}</strong><span>${escapeHTML(track.artist?.username || "Independent artist")}</span></div></div>
      <span class="track-album">${escapeHTML(track.artist?.username || "—")}</span>
      <button class="track-play" data-play="${escapeHTML(track.uri)}" data-title="${escapeHTML(track.title)}" data-artist="${escapeHTML(track.artist?.username || "Independent artist")}" aria-label="Play ${escapeHTML(track.title)}">▶</button>
    </div>`).join("")}</div>`;
}

function albumsGrid(albums) {
  if (!albums.length) return `<div class="empty-state"><div class="empty-icon">▦</div><strong>No albums yet</strong><p>Artist albums will appear here when they are released.</p></div>`;
  return `<div class="album-grid">${albums.map((album) => `<button class="album-card" data-album="${escapeHTML(album._id || album.id)}"><div class="album-art">♫</div><strong>${escapeHTML(album.title)}</strong><span>${escapeHTML(album.artist?.username || "Independent artist")} · ${(album.musics || []).length} ${(album.musics || []).length === 1 ? "track" : "tracks"}</span></button>`).join("")}</div>`;
}

function renderHome() {
  if (state.user?.role === "artist") {
    content.innerHTML = `${heroTemplate()}<div class="section-heading"><div><h2>Your music</h2><p>Tracks uploaded by your artist account</p></div><button class="text-button" data-view="library">VIEW ALL →</button></div>${trackRows(state.tracks.slice(0, 5))}`;
    return;
  }
  content.innerHTML = `${heroTemplate()}<div class="section-heading"><div><h2>Made for this moment</h2><p>A few tracks from your music collection</p></div><button class="text-button" data-view="library">VIEW ALL →</button></div>${trackRows(state.tracks.slice(0, 5))}<div class="section-heading"><div><h2>Find a new favorite</h2><p>Albums from artists in your space</p></div><button class="text-button" data-view="albums">VIEW ALBUMS →</button></div>${albumsGrid(state.albums.slice(0, 4))}`;
}

function renderLibrary() {
  content.innerHTML = `${heroTemplate()}<div class="section-heading"><div><h2>Your listening library</h2><p>${state.tracks.length} tracks ready to play</p></div></div>${trackRows(state.tracks)}`;
}

function renderAlbums() {
  content.innerHTML = `${heroTemplate()}<div class="section-heading"><div><h2>Albums</h2><p>Full collections from the artists in your space</p></div></div>${albumsGrid(state.albums)}`;
}

function renderAlbum(album) {
  const tracks = album.musics || [];
  content.innerHTML = `<button class="back-link" data-view="albums">← Back to albums</button><section class="detail-hero"><div class="detail-art">♫</div><div class="detail-meta"><p class="eyebrow">ALBUM</p><h1>${escapeHTML(album.title)}</h1><p>${escapeHTML(album.artist?.username || "Independent artist")} · ${tracks.length} ${tracks.length === 1 ? "track" : "tracks"}</p><div class="detail-controls">${tracks.length ? `<button class="button button-primary" data-play="${escapeHTML(tracks[0].uri)}" data-title="${escapeHTML(tracks[0].title)}" data-artist="${escapeHTML(album.artist?.username || "Independent artist")}">▶ Play album</button>` : ""}</div></div></section><div class="section-heading"><div><h2>Tracklist</h2><p>Play any track in this album</p></div></div>${trackRows(tracks)}`;
}

function uploadStudio() {
  const isArtist = state.user?.role === "artist";
  const availableTracks = isArtist ? artistTracks() : state.tracks;
  const selections = availableTracks.length
    ? `<div class="checklist">${availableTracks.map((track) => { const id = `album-track-${escapeHTML(track._id || track.id)}`; return `<label class="check-row" for="${id}"><input id="${id}" type="checkbox" name="albumTrack" value="${escapeHTML(track._id || track.id)}"> ${escapeHTML(track.title)}</label>`; }).join("")}</div>`
    : `<div class="empty-state"><strong>No tracks available</strong><p>${isArtist ? "Upload a track before adding music to an album." : "Artists need to share music before you can build an album."}</p></div>`;
  return `<header class="section-heading"><div><p class="eyebrow">${isArtist ? "ARTIST STUDIO" : "YOUR MUSIC SPACE"}</p><h1>${isArtist ? "Artist studio" : "Create an album"}</h1><p>${isArtist ? "Share tracks and organize the music you have uploaded." : "Choose tracks from the catalog and make a collection of your own."}</p></div></header><div class="artist-layout ${isArtist ? "" : "single-card"}"${isArtist ? "" : ' style="grid-template-columns:minmax(320px,750px)"'}>
    ${isArtist ? `<section class="studio-card"><span class="artist-badge">ARTIST STUDIO</span><h2>Share a new track</h2><p>Upload your audio and give it a name that stays with people.</p><form class="form-stack" id="uploadForm"><label for="trackTitle">Track title<input id="trackTitle" name="title" required maxlength="120" placeholder="Give your track a title"></label><label for="audioFile">Audio file<input id="audioFile" name="music" type="file" accept="audio/*" required></label><button class="button button-primary form-submit" type="submit">Upload track</button><p class="form-message" id="uploadMessage" aria-live="polite"></p></form></section>` : ""}
    <section class="studio-card"><span class="artist-badge">YOUR COLLECTION</span><h2>Create an album</h2><p>${isArtist ? "Choose tracks uploaded by your artist account." : "Choose tracks from the music catalog to make your own collection."}</p><form class="form-stack" id="albumForm"><label for="albumTitle">Album title<input id="albumTitle" name="title" required maxlength="120" placeholder="A collection of songs"></label><div role="group" aria-labelledby="albumTracksLabel"><p id="albumTracksLabel"><strong>Choose tracks</strong></p>${selections}</div><button class="button button-primary form-submit" type="submit">Create album</button></form></section>
  </div><div class="section-heading"><div><h2>${isArtist ? "Your tracks" : "Available tracks"}</h2><p>${isArtist ? "Tracks saved to your artist account" : "Tracks you can add to your albums"}</p></div></div>${trackRows(availableTracks)}`;
}

function render() {
  $$(".nav-item[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
  const authButton = $("#authButton");
  authButton.classList.toggle("hidden", Boolean(state.user));
  const userMenu = $("#userMenu");
  userMenu.classList.toggle("hidden", !state.user);
  if (state.user) userMenu.textContent = state.user.username.slice(0, 1).toUpperCase();

  if (!state.user) state.view = "home";
  if (["albums", "library", "studio"].includes(state.view) && !state.user) state.view = "home";

  if (state.currentAlbum) return renderAlbum(state.currentAlbum);
  if (state.view === "studio") content.innerHTML = uploadStudio();
  else if (state.view === "library") renderLibrary();
  else if (state.view === "albums") renderAlbums();
  else renderHome();
}

async function loadUserData() {
  if (!state.user) return;
  const results = await Promise.allSettled([api("/api/music"), api("/api/music/albums")]);
  if (results[0].status === "fulfilled") state.tracks = results[0].value.musics || [];
  if (results[1].status === "fulfilled") state.albums = results[1].value.albums || [];
  const failed = results.find((result) => result.status === "rejected");
  if (failed) toast(failed.reason.message);
}

function openAuth(mode = "login") {
  setAuthMode(mode);
  $("#authMessage").textContent = "";
  $("#authModal").classList.remove("hidden");
}

function closeAuth() { $("#authModal").classList.add("hidden"); }

function setAuthMode(mode) {
  state.authMode = mode;
  $$(".auth-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.authMode === mode));
  $$(".register-only").forEach((field) => field.classList.toggle("hidden", mode !== "register"));
  $$(".login-only").forEach((field) => field.classList.toggle("hidden", mode !== "login"));
  $("#authTitle").textContent = mode === "register" ? "Make this your music space." : "Music sounds better together.";
  $("#authSubmit").textContent = mode === "register" ? "Create account" : "Log in";
  $("#authForm [name=password]").autocomplete = mode === "register" ? "new-password" : "current-password";
  $("#authForm [name=identity]").required = mode === "login";
  $("#authForm [name=email]").required = mode === "register";
  $("#authForm [name=username]").required = mode === "register";
}

function playTrack(url, title, artist) {
  if (!url) return toast("This track does not have a playable audio URL.");
  if (audio.src !== new URL(url, location.href).href) audio.src = url;
  $("#playerTitle").textContent = title || "Unknown track";
  $("#playerArtist").textContent = artist || "Independent artist";
  $("#playerArt").textContent = "♫";
  audio.play().then(() => { $("#playToggle").textContent = "Ⅱ"; }).catch(() => toast("The audio could not be played. Check that the media URL is public."));
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const message = $("#authMessage");
  const submit = $("#authSubmit");
  submit.disabled = true;
  submit.textContent = "Please wait…";
  message.textContent = "";
  try {
    const register = state.authMode === "register";
    const payload = register
      ? { username: values.get("username"), email: values.get("email"), password: values.get("password"), role: values.get("role") }
      : { username: values.get("identity"), password: values.get("password") };
    const data = await api(register ? "/api/auth/register" : "/api/auth/login", { method: "POST", body: JSON.stringify(payload) });
    state.user = data.user;
    state.view = "home";
    closeAuth();
    setConnection(true);
    await loadUserData();
    render();
    toast(register ? "Welcome to Soundspace." : `Welcome back, ${state.user.username}.`);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = state.authMode === "register" ? "Create account" : "Log in";
  }
}

async function handleGoogleCredential(response) {
  const message = $("#authMessage");
  message.textContent = "Signing in with Google…";
  try {
    const data = await api("/api/auth/google", { method: "POST", body: JSON.stringify({ credential: response.credential }) });
    state.user = data.user;
    state.view = "home";
    closeAuth();
    setConnection(true);
    await loadUserData();
    render();
    toast(`Welcome, ${state.user.username}.`);
  } catch (error) {
    message.textContent = error.message;
  }
}

async function setupGoogleSignIn() {
  try {
    const { clientId } = await api("/api/auth/google/config");
    if (!clientId) return;
    await googleIdentityReady;
    if (!window.google?.accounts?.id) return;
    window.google.accounts.id.initialize({ client_id: clientId, callback: handleGoogleCredential });
    window.google.accounts.id.renderButton($("#googleSignIn"), { theme: "filled_black", size: "large", shape: "rectangular", text: "continue_with", width: 320 });
  } catch (error) {
    // Google sign in remains unavailable if the provider script or config cannot load.
  }
}

async function handleUpload(event) {
  event.preventDefault();
  const form = event.target;
  const submit = $("button[type=submit]", form);
  const formData = new FormData(form);
  submit.disabled = true;
  submit.textContent = "Uploading…";
  $("#uploadMessage").textContent = "Uploading your track…";
  try {
    const result = await api("/api/music/upload", { method: "POST", body: formData });
    state.recentUploads.unshift(result.music);
    form.reset();
    render();
    toast("Track uploaded and added to your space.");
  } catch (error) {
    const message = $("#uploadMessage");
    if (message) message.textContent = error.message;
    toast(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = "Upload track";
  }
}

async function handleAlbumCreate(event) {
  event.preventDefault();
  const form = event.target;
  const submit = $("button[type=submit]", form);
  const values = new FormData(form);
  const selected = values.getAll("albumTrack");
  const pasted = String(values.get("musicIds") || "").split(",").map((id) => id.trim()).filter(Boolean);
  submit.disabled = true;
  submit.textContent = "Creating…";
  try {
    await api("/api/music/album", {
      method: "POST",
      body: JSON.stringify({ title: values.get("title"), musics: [...new Set([...selected, ...pasted])] }),
    });
    form.reset();
    toast("Album created successfully.");
  } catch (error) {
    toast(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = "Create album";
  }
}

async function openAlbum(id) {
  try {
    const result = await api(`/api/music/albums/${encodeURIComponent(id)}`);
    state.currentAlbum = result.album;
    state.returnView = state.view;
    render();
  } catch (error) { toast(error.message); }
}

document.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    state.currentAlbum = null;
    state.view = viewButton.dataset.view;
    render();
    return;
  }
  const authOpener = event.target.closest("[data-open-auth]");
  if (authOpener) return openAuth(authOpener.dataset.openAuth);
  const authMode = event.target.closest("[data-auth-mode]");
  if (authMode) return setAuthMode(authMode.dataset.authMode);
  const play = event.target.closest("[data-play]");
  if (play) return playTrack(play.dataset.play, play.dataset.title, play.dataset.artist);
  const album = event.target.closest("[data-album]");
  if (album) return openAlbum(album.dataset.album);
});

$("#authButton").addEventListener("click", () => openAuth("login"));
$("#closeAuth").addEventListener("click", closeAuth);
$("#authModal").addEventListener("click", (event) => { if (event.target.id === "authModal") closeAuth(); });
$("#authForm").addEventListener("submit", handleAuthSubmit);
$("#userMenu").addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
    state.user = null;
    state.tracks = [];
    state.albums = [];
    state.recentUploads = [];
    state.currentAlbum = null;
    state.view = "home";
    render();
    toast("You’re signed out. See you next time.");
  } catch (error) { toast(error.message); }
});

$("#content").addEventListener("submit", (event) => {
  if (event.target.id === "uploadForm") handleUpload(event);
  if (event.target.id === "albumForm") handleAlbumCreate(event);
});

$("#playToggle").addEventListener("click", () => {
  if (!audio.src) return toast("Choose a track to start listening.");
  if (audio.paused) audio.play().then(() => { $("#playToggle").textContent = "Ⅱ"; }).catch(() => toast("The audio could not be played."));
  else { audio.pause(); $("#playToggle").textContent = "▶"; }
});
audio.addEventListener("play", () => { $("#playToggle").textContent = "Ⅱ"; });
audio.addEventListener("pause", () => { $("#playToggle").textContent = "▶"; });
audio.addEventListener("timeupdate", () => {
  $("#currentTime").textContent = formatTime(audio.currentTime);
  $("#seekBar").value = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
});
audio.addEventListener("loadedmetadata", () => { $("#duration").textContent = formatTime(audio.duration); });
$("#seekBar").addEventListener("input", (event) => { if (audio.duration) audio.currentTime = (Number(event.target.value) / 100) * audio.duration; });
$("#volume").addEventListener("input", (event) => { audio.volume = Number(event.target.value) / 100; });
$("#backButton").addEventListener("click", () => { state.currentAlbum = null; state.view = state.returnView || "home"; render(); });
$("#forwardButton").addEventListener("click", () => toast("Choose an album or section to continue."));
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeAuth(); });

async function init() {
  render();
  setupGoogleSignIn();
  try {
    const result = await api("/api/auth/me");
    state.user = result.user;
    await loadUserData();
    setConnection(true);
  } catch (error) {
    // A 401 is the expected response when nobody is signed in; the API is still reachable.
    setConnection(error.status === 401 || Boolean(error.status));
  }
  render();
}

init();
