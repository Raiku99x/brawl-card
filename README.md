# BRAWL CARDS — Online Multiplayer

Street combat card game with local 2P, CPU (Easy/Medium/Hard), and **online multiplayer** via Supabase Realtime.

---

## Deploy in 3 Steps

### STEP 1 — Set up Supabase (free)

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project (any name, any region)
3. Go to **Table Editor → New Table**:
   - Table name: `rooms`
   - Columns:
     - `id` → type `text`, Primary Key (uncheck "Is Identity")
     - `p1_ready` → type `bool`, default `false`
     - `p2_ready` → type `bool`, default `false`
   - **Disable Row Level Security (RLS)** for now (toggle off)
4. Go to **Project Settings → API**
   - Copy your **Project URL** (looks like `https://xxxx.supabase.co`)
   - Copy your **anon/public** key

5. Open `public/game.js` and replace lines 8–9:
   ```js
   const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
   const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';
   ```

---

### STEP 2 — Push to GitHub

```bash
git init
git add .
git commit -m "brawl cards online"
git remote add origin https://github.com/YOUR_USERNAME/brawl-cards.git
git push -u origin main
```

---

### STEP 3 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repo
3. Framework preset: **Other** (no framework)
4. Leave all settings default — click **Deploy**
5. Done! Share your `.vercel.app` URL with a friend

---

## How Online Mode Works

1. Player 1 clicks **CREATE ROOM** → gets a 4-letter code like `XK92`
2. Player 2 clicks **JOIN ROOM** → enters the code
3. Both players see their own move panel only
4. Each picks a move secretly — when both lock in, the round resolves automatically
5. Full cinematic combat plays on both screens simultaneously

---

## Local Modes (no setup needed)

- **2 PLAYER LOCAL** — pass the device, same screen
- **VS CPU EASY/MEDIUM/HARD** — single player vs AI

---

## Project Structure

```
brawl-cards/
├── public/
│   ├── index.html    ← game UI
│   ├── style.css     ← all styles
│   └── game.js       ← game logic + online multiplayer
├── vercel.json       ← tells Vercel to serve /public
└── README.md
```
