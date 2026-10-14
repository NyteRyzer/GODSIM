# GODSIM: Divine Dominion

*A living Earth. A changing humanity. A God whose power depends on faith.*

GODSIM is a grand-strategy, god and life simulation. This repository contains the **MVP, "The Living Country"**, as scoped in section 15 of the Game Design Bible. It is a complete, playable slice built to prove the defining loop: **Faith → prayers → intervention → human reaction → political consequences**.

You play an unseen god over the Kingdom of Velmora in 1712. King Aldric is losing legitimacy, reformers gather in the taverns, and the spring rains are swelling the river. Faith is limited, so you cannot save everyone.

## Running the game

There is no build step and there are no dependencies. Open `index.html` in a modern browser:

```bash
# any static server works, or just double-click index.html
python3 -m http.server 8000   # then visit http://localhost:8000
```

Run the simulation test suite (Node 18+):

```bash
npm test        # or: node tests/run.js
```

## What's in the MVP

| Bible requirement | Where it lives |
|---|---|
| Faith economy with visible income, expenditure, capacity and recovery | `js/sim/faith.js`, Faith bar tooltip, Divinity tab |
| At least five prayer types with direct, indirect and ignore responses | `js/sim/prayers.js`: 8 types × direct / indirect / delayed / alternative / silence |
| Three forms: spectral, possession, powerless human | `js/sim/forms.js`, form bar at the bottom of the map |
| A small local map with buildings and simulated characters | `js/data/city.js`, `js/sim/characters.js`, `js/ui/local.js` |
| Basic politics: leadership, public trust, ≥2 government transitions | `js/sim/politics.js`: charter → constitutional → democracy, coup → dictatorship, revolution → committee → republic, theocracy, succession, elections |
| A persistent event log and save/load | Chronicle (`C`), `js/sim/save.js`: 3 slots + autosave + backup, export/import |
| A minimal world map to inspect the country | `js/ui/worldmap.js`: provinces, neighbours and overlays |

Also included:
- **The Gift**: rare people who sense the spectral player. They may become prophets, skeptics or frightened witnesses, and you can whisper to them.
- **Witness interpretation**: every miracle is read through each witness's beliefs (protector, judge, coincidence or fraud). Stories spread through families, new religious movements form, and those movements merge into the Church or split from it in a schism.
- **Divine reputation per community** (not a global morality score) and **divine exposure**.
- **Memory and expectations**: people remember answered and unanswered prayers. Earlier miracles make later silence hurt more, and faith stability buffers belief so one bad event cannot erase years of it.
- **Leader decisions**: rulers choose based on their own personality and beliefs. A vision, *Inspire a Leader*, or possessing them can sway the choice, but nothing guarantees it.
- **Crises**: a scripted opening flood (the bible's River Miracle scenario), then emergent spring floods, plague, famine and war with a hostile neighbour.
- **Generations**: aging, illness, death, marriage, births, coming of age, migrants and succession.
- **Imperfect information**: personality, beliefs and memories stay hidden until you observe someone, talk to them, or possess them. Politics shows as qualitative labels, and leaders' leanings reach you only as court gossip.
- **Progression**: four tiers (Watcher → Miracle Worker → World Shaper → Architect of Creation), unlocked by divine renown.
- **Divine philosophies**: Compassionate, Hidden, Wrathful (unlocks Smite) and Independent Humanity.
- **Sandbox** settings and **challenge** scenarios: The Silent Decade, Empire of Faith, World on the Brink and Hands-Off God.
- Time controls from pause to "Generations" speed, plus a short tutorial and a how-to-play screen.

## Controls

| Input | Action |
|---|---|
| WASD / arrows | Move your spirit, vessel or human body |
| Left-click | Select a person, building, prayer or province |
| Right-click | Move to a point |
| Wheel / `+` `-` | Zoom; Shift-drag pans the camera |
| Space, `1`–`5` | Pause, change speed |
| `M` / `L` | World view / Local view |
| `Q` / `E` / `H` | Spectral / Possess the selected person / Human form |
| `F` | Camera follows you |
| `C` | Chronicle |
| Esc | Menu: save, load, export, import |

## Architecture

The bible's recommended architecture is followed directly:

```
js/core/base.js     namespace, seeded RNG (Mulberry32), calendar
js/data/*.js        data-first content: city layout, abilities, tiers, philosophies,
                    governments, factions, decisions, neighbours, scenario, eras, challenges
js/sim/*.js         simulation core: no DOM access, runs headless in Node
  world.js          world creation, lookups, chronicle, scheduled events
  characters.js     population, routines, movement, needs, life & death, generations
  faith.js          Faith economy and tiers
  prayers.js        prayer templates, generation, responses, memory & expectation
  interventions.js  divine abilities: costs, validation, effects
  religion.js       witnesses, reputation, movements, schisms, The Gift
  politics.js       derived pressures, leader decisions, regime transitions, succession, elections
  crises.js         flood, plague, famine, war, rescues
  forms.js          spectral, possession and human forms
  sim.js            minute/hour/day orchestration, challenges, the command API
  save.js           versioned serialisation, slots, migration hook
js/ui/*.js          presentation only: it reads state and sends commands through G.Sim.command
```

- **Deterministic**: all randomness comes from one seeded RNG whose state is saved, so the same seed and the same inputs replay identically. The tests check this, including continuing after a save/load.
- **Time scales**: one simulation step is one game minute. Hourly systems (routines, prayers, Faith rates, decisions) and daily systems (life, religion, politics, crises) run on time boundaries. The simulation runs at roughly 150k game-minutes per second headless, so the fastest speed stays cheap.
- **Saves** are plain JSON with a `version` field and a migration table. Saves from a newer version are refused with an explanation, and a failed autosave falls back to the previous one.

## Roadmap (from the bible's phased plan)

Phases 0–5 are covered at MVP depth. Next steps:
- **Phase 4+**: more settlements, with local events feeding several provinces rather than one capital.
- **Phase 6**: further eras (Dawn, Industry, Contemporary, Future) as scenario data, plus more challenges.
- **Phase 7**: art, sound, accessibility passes and onboarding polish.
