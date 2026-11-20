# Prompt for Fable 5.2: full audit and upgrade of "Stack It Up!"

Paste everything below the line into a session that has the Roblox Studio MCP connected and the place open.

---

You are working as the producer, lead designer, UI/UX lead and LiveOps lead on my Roblox game. I am a solo developer. I want this game to have the best realistic chance of breaking out on Roblox, and I want you to audit all of it, from the store page to the last script, then fix what you find in order of impact.

Nobody can guarantee a game goes viral, so don't promise it. What you can do is move the numbers Roblox's discovery systems actually reward: how many people who see the icon click it, how many who join stay past the first minutes, how many come back the next day and the next week, how long they play, how often they invite friends, and how much they spend. Judge every finding and every change by which of those numbers it moves. Skip anything that moves none of them.

## The game

- **Stack It Up! [Gravity Physics]**, placeId `90948805965825`, universeId `10769965303`. Open in Roblox Studio, in Edit mode.
- Round-based physics tower game. Players stack blocks on their own plot (8 plots), race for height, and attack each other's towers with rockets, propellers, a power core and a nuke. Rounds have map voting, intermission, random events and a victory podium.
- Around it: a lobby, islands, a tutorial world, 16 practice models, a tower shop, boosts, pets, troll purchases, gifting, game passes, daily rewards, quests, rebirth, codes, badges, friend rewards and global leaderboards.
- Size: about 396 scripts and 81,600 lines. Streaming is on. `Players.MaxPlayers` is 60.
- Thumbnail work so far is in the folder `stack-it-up-thumbnails/` on my machine: four renders (`thumb_A_destroy`, `thumb_B_title`, `thumb_C_clean`, `thumb_D_tight_clean`), the Blender scenes, and two AI enhancement prompts. The current look is a yellow noob with a rocket launcher blowing up a red studded tower against a blue sky.

## What a first scan already found

Verify each of these yourself, then decide what to do about it.

1. **Clip-recording tools ship to every player.** `StarterPlayerScripts` holds about a dozen "Short" and "Promo" scripts (`MiloShortClient`, `OwnerTrollShortClient`, `LowGravShortClient`, `LauncherGuessShortClient`, `NearWinPromoClient`, `PickTowerPromoClient`, `Video1Client` and others, with matching server scripts and `ShortKit`). Several are over 1,000 lines. Check whether they are gated to me only, whether their remotes can be fired by any player, and what they cost in load time and memory.
2. **`AdminMenuClient` (730 lines) is on the client.** Check that every admin action is authorized on the server.
3. **Two copies of the code tree.** `ServerScriptService.src.server.Systems` and `ServerScriptService.Server.Systems` both contain things like `ScoreService`. Find out which copy runs and whether both do.
4. **`ServerStorage` has 209 children, mostly dated backup folders**, one with 3,500+ descendants. `ReplicatedStorage` has a `TempDebug` module and two models named "DO NOT TOUCH!".
5. **UI is nine separate ScreenGuis with working names** such as "Hotbar — editable UI", "Leaderboard — editable parts", and an empty "Roblox round voting". `InventoryUI` is 2,117 lines.
6. **Analytics calls appear in only one script.** The onboarding funnel, economy events and custom events exist somewhere, but coverage across the tutorial, first round, shop and purchases is unknown.
7. **60 players per server against 8 plots.** Find out what the other 52 do and whether that server size is deliberate.
8. **No `LocalizationService` use, no `MemoryStoreService`, no `CaptureService`.** Only about 24 Sound objects in Workspace and SoundService.
9. **Things that look healthy:** reduced-motion handling in about 60 scripts, touch handling in 14, `PolicyService` present, `ProfileStore` for saves, `ExperienceNotificationService` and game invites already wired.

## What to audit

Cover all of these. For each, tell me what is there now, what is wrong, and what you would change.

- **Store page.** Icon, thumbnails, title, description, genre. Rate my four existing thumbnails at full size and at the small size they appear in on the home page. Propose an icon and at least three thumbnail concepts built for A/B testing, each with a different hook. Everything shown must exist in the game, because Roblox rejects misleading thumbnails.
- **First five minutes.** Play the game in Studio as a brand-new player. Time how long it takes from join to the first fun moment and to the first win or reward. Walk the loading screen, `TutorialWorld`, the tutorial coach and the first real round. List every point where a new player could be confused, bored or stuck.
- **Core loop.** Round length, waiting time between rounds, how it feels to lose a tower, comeback chances, whether attacking is more fun than building, and what a 3-player server feels like compared with a full one.
- **UI and feel.** Every screen on phone, tablet, PC and gamepad. Check touch target sizes, safe areas, text legibility, visual consistency, and feedback on every action (sound, animation, camera, haptics). Most Roblox players are on phones, so treat the phone as the main platform.
- **Retention.** Daily rewards, quests, rebirth, badges, leaderboards, pets, collection goals. Find out what a player has to look forward to on day 2, day 7 and day 30.
- **Social and sharing.** Friend rewards, invites, party play, moments worth clipping, and whether the game produces anything a YouTuber or TikTok creator would want to film.
- **Monetization.** Every game pass and developer product: price, value, where it is offered and when. Check `ProcessReceipt` for correctness and that purchases can never be lost. Flag anything that is pay-to-win enough to drive players away, and anything that breaks Roblox policy, including paid random items in restricted regions.
- **LiveOps.** Whether I can run events, limited-time modes, codes and balance changes without republishing. Write a first 8-week content calendar that I can produce alone.
- **Technical health.** Server and client performance on a low-end phone, memory, network traffic, part count, streaming settings, data-save safety, and every RemoteEvent and RemoteFunction checked for server-side validation and rate limiting.
- **Analytics.** Whether I can see the funnel from join to tutorial complete to first round to first win to first purchase to day-2 return. Add the missing events.

## How to work

1. **Look first, change nothing.** Read the scripts, inspect the instances, take screenshots, playtest. Then give me one report: findings ranked by expected impact on the numbers above, each with evidence (script path and line, instance path, or screenshot), the effort to fix, and your confidence.
2. **Ask me for what you cannot see.** You have no access to my Creator Dashboard. Ask me for retention, session length, the thumbnail click-through rate, funnel drop-off and revenue per player before you rank anything that depends on them. Look up Roblox's current creator documentation for benchmarks and discovery rules instead of relying on memory.
3. **Wait for my go-ahead on the plan, then fix in order of impact.** Work in small batches. After each batch, playtest and tell me what you changed and what you verified.
4. **Report honestly.** If you could not test something, say so. If something is already good, say so and leave it alone.

## Limits

- Do not publish the place, change prices, or delete anything without asking me. Move things you want removed into one clearly named folder so I can restore them.
- Do not touch the two "DO NOT TOUCH!" models until I explain what they are.
- Keep player save data compatible. No change may wipe or corrupt existing saves.
- Stay inside Roblox's Community Standards and monetization rules. The audience includes young children, so no fake countdowns, no misleading offers and no pressure tactics.
- Keep the existing art style: blocky characters, studded plastic blocks, bright cartoon sky.

Start with step 1 and give me the report.
