# Luke's Dashboard

Personal dashboard hub for Luke's tools and side projects. A single-page React app deployed on Vercel.

## Tech Stack

- **React 19 + Vite** — frontend framework and build tool
- **React Router v7** — client-side routing
- **Tailwind CSS v3** — utility-first styling
- **Recharts** — charts in the Debt Payoff Calculator
- **lucide-react** — icon library
- **Vercel** — production hosting

## Folder Structure

```
src/
├── pages/          # One file per tool/page (Home, DebtCalculator, VersaRepair, TaskManager)
├── components/     # Shared UI (ToolCard, TopNav, ProtectedRoute)
└── utils/          # Hooks and helpers (useRandomPalette.js)
```

## How to Add a New Tool

1. Create `src/pages/YourTool.jsx` — include `<TopNav />` at the top
2. Add a route in `src/App.jsx`:
   ```jsx
   <Route path="/your-tool" element={<ProtectedRoute><YourTool /></ProtectedRoute>} />
   ```
3. Add a `ToolCard` entry to the `tools` array in `src/pages/Home.jsx`

## How to Add a New Background Palette

Edit `src/utils/useRandomPalette.js` — append a new CSS radial-gradient string to the `palettes` array. It will be randomly selected on page load.

## Password Gate

Routes are protected by a client-side password gate (`src/components/ProtectedRoute.jsx`). Auth state is stored in `localStorage`. This is convenience-only — **keep the repo private** and do not store sensitive data in the app.

## Commands

```bash
npm run dev      # start local dev server
npm run build    # production build
```
