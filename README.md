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
npx firebase-tools deploy --only firestore:rules,storage
```

Or paste `firestore.rules` and `storage.rules` into the Firebase Console (Firestore → Rules and Storage → Rules).

Storage rules use Auth custom claims (`request.auth.token.role`), not Firestore lookups.

### 5. Service account (for custom auth claims)

Product and homepage image uploads require a `master-admin` claim on the signed-in user's token.

1. Firebase Console → Project settings → **Service accounts** → **Generate new private key**
2. Add to `.env.local`:

```env
FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

(`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` are also supported.)

Claims sync automatically on sign-in. After changing a user's role in Admin → Users, that user should refresh the page (or sign in again) for storage access to update.

### 6. Run locally

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
