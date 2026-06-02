# TODO — Settings — Full Spec (backend + frontend) + recent Tasks fixes

## Done
- Tasks flow: removed due/status UI and activity entries; hardened expanded subtasks rendering to prevent white screen when subtasks shape is legacy/missing.

## In Progress
### 1) Appearance (spec-critical, no-flash)
- [ ] Update DB schema: add `font_size`, `location` (and any other required Appearance fields)
- [ ] Create Drizzle migration `drizzle/0005_add_settings_full_spec.sql`
- [ ] Extend `server/routes/settings.ts` GET/PATCH to include new Appearance fields
- [ ] Update `src/pages/SettingsPage.tsx` Appearance tab to match spec:
  - [ ] Free: “Customise Your App” single card + Subscribe -> /pricing
  - [ ] Paid: full accent picker popup (hex, RGB, hue/sat gradient, brightness, opacity, preview swatch with ring)
  - [ ] Theme: Light/Dark/System apply instantly across app
  - [ ] Font Family (Inter/Nunito/Outfit/Roboto) instant
  - [ ] Font Size (Small/Medium/Large) instant
  - [ ] Language dropdown styled like task filter dropdown
  - [ ] Location dropdown styled like language dropdown; updates pricing currency
  - [ ] Reset All to Defaults confirmation dialog
  - [ ] Remove localStorage-driven accent/theme/font apply to guarantee no flash; apply only after `/api/settings` first load

### 2) Notifications, Calendar, Energy Levels, Account, History, Privacy, Shortcuts
- [ ] Implement remaining backend endpoints + DB tables as needed
- [ ] Align UI with exact spec and wire persistence
- [ ] Thorough manual UI + curl endpoint testing
