# Arena Ouroboros

> A high-stakes, 3v3 turn-based strategy game inspired by Naruto Arena, built with Next.js 15, Supabase Realtime, and the Ouroboros Combat Engine.

## ⚡ Quick Start

### Prerequisites
- Node.js 20+
- Supabase Project (Database + Realtime)

### Installation
```bash
# Clone the repository
git clone [repository-url]

# Install dependencies
npm install

# Setup environment
cp .env.example .env.local
# Add your NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### Development
```bash
npm run dev
```

## 🎮 Core Features

- **Ouroboros Engine**: A deterministic turn-based combat system with 5 energy colors.
- **Realtime PvP**: Low-latency multiplayer powered by Supabase Realtime Broadcast.
- **Progression System**: Earn XP per lineage, unlock characters, and climb the ELO ranks.
- **Smart Lobby**: 3-button entry (Quick PvP, Ranked, Vs AI) with Team Presets support.
- **Anti-Cheat & Reliability**: Server-authoritative state validation and AFK timeout protection.

## 🏗️ Architecture

- **Frontend**: Next.js 15 (App Router), Tailwind CSS.
- **Backend / Realtime**: Supabase Postgres, Edge Functions, and Realtime Channels.
- **Engine**: Pure TypeScript classes for deterministic simulation.

## 📚 Documentation

For deep dives into mechanics and integration, see the [Index](./docs/architecture.md):
- [Combat Engine](./docs/engine.md)
- [API Reference](./docs/api.md)
- [Database Schema](./docs/database.md)
- [Economy & Rewards](./docs/economy.md)

## 📜 License

Private / Confidential.
