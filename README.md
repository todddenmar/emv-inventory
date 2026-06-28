# Elmiovicente Shop

Inventory management system with an online shop, built with Next.js 16, Tailwind CSS, shadcn/ui, Zustand, and Firebase.

## Features

- **Online shop** — browse products, cart, checkout with customer details
- **Geolocation delivery** — capture customer GPS coordinates at checkout
- **Cash on Delivery (COD)** — pay when the order arrives
- **Inventory admin** — add/edit products, track stock, low-stock alerts
- **Order management** — real-time order list with status updates
- **Auth** — Google sign-in and anonymous guest login
- **Roles** — first Google sign-in becomes master-admin; master-admin can invite managers via link or email

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Firebase project

1. Create a project at [Firebase Console](https://console.firebase.google.com)
2. Enable **Authentication** → Google and Anonymous providers
3. Create a **Firestore** database
4. Copy web app config to `.env.local` (see `.env.example`)

### 3. Firestore indexes

Create a composite index for customer orders:

- Collection: `orders`
- Fields: `customerId` (Ascending), `createdAt` (Descending)

Firebase will prompt you with a link when the index is first needed.

### 4. Deploy security rules

```bash
firebase deploy --only firestore:rules
```

Or paste `firestore.rules` into the Firebase Console → Firestore → Rules.

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. **First setup** — sign in with Google at `/login`. You become master-admin.
2. **Add products** — go to Admin → Products.
3. **Invite managers** — Admin → Invites → create link or email invite.
4. **Customers** — browse `/`, add to cart, checkout with address + location share.

## Tech stack

- Next.js 16 (App Router)
- Tailwind CSS v4 + shadcn/ui
- Zustand (cart + auth state)
- Firebase Auth + Firestore
- React Hook Form + Zod
