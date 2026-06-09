# Continuum

A persistent AI interface layer. One user, one AI presence that remembers, evolves, and maintains continuity.

## What This Is

Not a chatbot. Not an assistant. A continuous AI relationship that:
- Remembers everything (3-tier memory: facts, moments, signals)
- Evolves its personality to match yours
- Surfaces reflections, prompts, and thread updates in a feed
- Tracks ongoing conversation threads across sessions
- Sends proactive notifications (max 2/day) referencing real context

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: JWT sessions (httpOnly cookies)
- **LLM**: Anthropic Claude (claude-sonnet-4-20250514)
- **Styling**: Tailwind CSS (dark theme)
- **Deploy**: Vercel (with cron jobs)

## Setup

### 1. Clone & Install

```bash
cd continuum
npm install
```

### 2. Environment

Copy `.env.example` to `.env` and fill in:

```
DATABASE_URL="postgresql://user:pass@localhost:5432/continuum"
JWT_SECRET="generate-a-random-string"
ANTHROPIC_API_KEY="sk-ant-..."
CRON_SECRET="generate-another-random-string"
```

### 3. Database

```bash
npx prisma db push
```

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000

### 5. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Set environment variables in Vercel dashboard. Cron jobs are configured in `vercel.json` and will auto-activate on deploy.

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── auth/        # signup, login, logout, me
│   │   ├── chat/        # send + receive messages
│   │   ├── feed/        # continuity timeline
│   │   ├── threads/     # ongoing conversations
│   │   ├── notifications/
│   │   ├── memory/      # view memories
│   │   ├── ai-state/    # personality state
│   │   └── cron/        # background job triggers
│   ├── (auth)/          # login/signup pages
│   └── home/            # main app
├── components/          # React UI
└── lib/
    ├── auth.ts          # JWT + sessions
    ├── db.ts            # Prisma client
    ├── llm.ts           # Claude API wrapper
    ├── prompt-engine.ts # builds system prompt
    ├── memory-engine.ts # extract, retrieve, summarize
    ├── feed-engine.ts   # generate feed items
    ├── thread-engine.ts # auto-detect + manage threads
    ├── energy-matcher.ts # detect user energy
    ├── background-loops.ts # 4 cron loops
    ├── notification-engine.ts # proactive pushes
    ├── hooks.ts         # React hooks
    ├── validations.ts   # Zod schemas
    └── constants.ts     # config values
```

## Background Jobs (Cron)

| Job | Schedule | What It Does |
|-----|----------|--------------|
| Memory Rollup | Every 12h | Compresses old moments into summaries |
| Feed Generation | Every 6h | Creates feed items from memory/threads/state |
| State Update | 3am + 3pm | Evolves AI personality from patterns |
| Notifications | 8am, 4pm, 11pm | Generates proactive pushes (max 2/day) |

## What's NOT Built (Yet)

- Echoverse (social layer)
- Multi-user
- Voice
- Image understanding
- Mobile native app




<!-- redeploy trigger -->
