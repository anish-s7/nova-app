# 🌌 Song Galaxy

**Connecting people through *why* they listen, not *what* they listen to.**

Built for HackGT, Meta Track: *Improving social connection using AI.*

## Overview

Most music platforms connect people by genre or artist. But two people can love
completely different songs for the exact same reason, like needing company on
lonely nights, getting hyped before a hard day, or working through grief.
Song Galaxy uses an LLM to understand the *reasons* behind people's music taste
and connect them based on shared emotional meaning.

## How It Works

1. **Create a profile.** Add your top 5 songs manually or by connecting Spotify.
2. **Share your why.** Write a short reason for why each song matters to you.
3. **Enter the Galaxy.** An LLM analyzes your reasons and places you in an
   interactive galaxy, linked to people who use music the way you do.
4. **Explore connections.** Browse the network and view profiles you're connected to.
5. **Generate a Connection Card.** See what you share, grounded in what you both
   actually wrote, plus one meaningful difference worth talking about.
6. **Start talking.** Send an AI-suggested opener with one tap, or start with a
   song swap: send a track with a one-line reason and get one back.

## Key Features

- **Meaning-based matching:** Connections come from shared listening motivations,
  not shared genres.
- **Connection Cards:** LLM-generated summaries of what you have in common,
  backed by evidence from both users' own words.
- **Conversation openers:** Personalized questions that remove the awkwardness
  of the first message.
- **Song Swap:** A low-pressure, music-first way to break the ice.
- **Privacy controls:** Users choose which reasons can appear on cards shown to others.

## Future Work

- **Growing cards:** Connection Cards that update as people trade songs and build
  a shared playlist together.
- **Constellations:** Small group chats of 3–5 people who share the same reason
  for listening.

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Framework** | [Next.js](https://nextjs.org/) (App Router) | Full-stack framework for both frontend and backend |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) | UI styling |
| **Backend** | Next.js Route Handlers | API endpoints for matching, card generation, and Spotify auth |
| **Database** | [Supabase](https://supabase.com/) (PostgreSQL) | User profiles, songs, reasons, connections, and messages |
| **Vector Search** | [pgvector](https://github.com/pgvector/pgvector) | Similarity search over embeddings of users' listening motivations |
| **Authentication** | Supabase Auth | User accounts and Spotify OAuth |
| **Real-time Messaging** | Supabase Realtime | Live chat between connected users |
| **AI / LLM** | [Google Gemini API](https://ai.google.dev/) | Interprets listening reasons, generates Connection Cards and conversation openers |
| **Embeddings** | Gemini Embeddings | Converts listening motivations into vectors for matching |
| **Music Data** | [Spotify Web API](https://developer.spotify.com/documentation/web-api) | Imports users' top tracks, album art, and song metadata |
| **Hosting** | [Vercel](https://vercel.com/) | Deployment and serverless functions |

### Architecture Overview

1. **Profile creation:** Users add their top 5 songs (manually or via Spotify) and
   write a short reason for each.
2. **Motivation extraction:** Gemini turns each free-text reason into structured
   listening motivations (e.g., "company during loneliness," "pre-game hype").
3. **Embedding and storage:** Motivations are embedded with Gemini and stored
   in Supabase using pgvector.
4. **Matching:** A nearest-neighbor search finds users with similar motivations,
   and those matches become the connections in the Galaxy.
5. **Connection Cards:** When a user opens a connection, Gemini generates a card
   from both profiles, covering shared reasons, one key difference, and
   conversation openers. Cards are cached in

## Team

Anish
Daniel
James
An