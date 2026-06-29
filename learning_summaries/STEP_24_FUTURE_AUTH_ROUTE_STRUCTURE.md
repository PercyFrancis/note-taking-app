# Step 24 Future Auth Route Structure

This note records the cleaner long-term auth routing option discussed while debugging the sign-out fetch error.

## Current Quick Fix

For now, the simpler approach is:

- Keep `/` public.
- Keep `/api/*` protected.
- Use Clerk signed-in/signed-out UI to decide what the user sees.
- Set Clerk's `afterSignOutUrl` to a public route such as `/`.

This avoids sending a signed-out user back to a route that immediately requires authentication.

## Long-Term Option

A cleaner production structure is to separate the public entry routes from the protected app route.

Example route shape:

```txt
/              public landing or signed-out page
/sign-in       public Clerk sign-in route
/sign-up       public Clerk sign-up route
/app           protected notebook app
/api/*         protected API routes
```

In this setup, the real notebook interface moves away from `/` and into a protected route such as `/app`.

## Why This Helps

The sign-out issue happened because the app was protecting nearly every route, including `/`.

After signing out, Clerk clears the session and then navigates somewhere. If that destination is protected, the request no longer has an authenticated user, so the navigation can fail.

The safer rule is:

```txt
afterSignOutUrl must point to a public route.
```

So with the long-term structure:

- after sign-out, send users to `/` or `/sign-in`
- after sign-in, send users to `/app`
- protect `/app`
- protect `/api/*`
- leave the public auth pages unprotected

## What Would Change Later

Later cleanup would likely involve:

- Creating a dedicated protected app route, such as `app/app/page.tsx`.
- Moving `NotebookApp` rendering from `/` to `/app`.
- Making `/` a public page or redirect-style entry point.
- Adding dedicated Clerk sign-in/sign-up routes if needed.
- Updating `proxy.ts` so only `/app` and `/api/*` are protected.
- Configuring Clerk redirect URLs so sign-in goes to `/app` and sign-out goes to `/`.

## Main Concept

Authentication becomes easier to reason about when public and private routes are clearly separated:

```txt
public routes: can be visited signed in or signed out
protected routes: require a signed-in Clerk user
API routes: require a signed-in Clerk user
```

This is not necessary for the immediate quick fix, but it is a better long-term structure for a deployed app.
