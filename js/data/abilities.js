// Divine abilities. Costs follow the bible's "initial ability cost targets" and scale in sim/interventions.js.
(function (G) {
  'use strict';

  G.Data.tiers = [
    { tier: 1, title: 'The Watcher', capacity: 300, earned: 0, unlocks: 'Observe, hear prayers, subtle signs, visions, possession' },
    { tier: 2, title: 'The Miracle Worker', capacity: 1000, earned: 40, unlocks: 'Healing, provision, protection, inspiration' },
    { tier: 3, title: 'The World Shaper', capacity: 4000, earned: 2000, unlocks: 'Regional miracles, leader inspiration, exposing truth' },
    { tier: 4, title: 'The Architect of Creation', capacity: 15000, earned: 10000, unlocks: 'National and global interventions' },
  ];

  // target: character | building | province | country
  G.Data.abilities = {
    subtle_sign: {
      name: 'Subtle Sign', tier: 1, target: 'character', base: 10, range: [5, 20], exposure: 0.3,
      scope: 'Small, ambiguous event', desc: 'A candle that will not go out, a bird at the window. Easily dismissed.',
    },
    vision: {
      name: 'Minor Vision', tier: 1, target: 'character', base: 35, range: [20, 60], exposure: 0.5,
      scope: 'Communication with an individual', desc: 'Speak to one person in a dream or waking vision.',
      options: {
        comfort: 'Comfort them',
        warning: 'Warn them of danger',
        guidance: 'Offer guidance',
        calling: 'Call them to prophecy',
        insight: 'Grant an insight',
      },
    },
    sway: {
      name: 'Sway', tier: 1, target: 'character', base: 30, range: [25, 160], exposure: 0.1,
      scope: 'Plant an ambition in someone', desc: 'Whisper an ambition into their dreams. Whether they act on it, and how, is up to them.',
      options: {
        war: 'Wage war on a neighbour', iron_fist: 'Rule with an iron fist', coup: 'Seize power in a coup', revolt: 'Rise up against the rulers',
        theocracy: 'Put the Church in power', reform: 'Push for reform', peace: 'Seek peace', mercy: 'Show mercy to the poor', loyalty: 'Stay loyal to the ruler',
      },
    },
    heal: {
      name: 'Heal', tier: 2, target: 'character', base: 50, range: [50, 150], exposure: 1.0,
      scope: 'Resolve a serious injury or condition', desc: 'Mend a body. Witnesses will talk.',
    },
    provide: {
      name: 'Provide', tier: 2, target: 'character', base: 70, range: [50, 120], exposure: 0.8,
      scope: 'Food and means for a household', desc: 'A full larder and an unexpected coin purse.',
    },
    inspire: {
      name: 'Inspire', tier: 2, target: 'character', base: 60, range: [40, 90], exposure: 0.2,
      scope: 'Strengthen courage or compassion', desc: 'Kindle courage or compassion. They still choose what to do with it.',
      options: { compassion: 'Kindle compassion', courage: 'Kindle courage', zeal: 'Kindle zeal' },
    },
    protect: {
      name: 'Protect a Small Group', tier: 2, target: 'building', base: 100, range: [100, 300], exposure: 1.2,
      scope: 'Reduce immediate danger', desc: 'Ward a building and everyone inside for two days.',
    },
    smite: {
      name: 'Smite', tier: 2, target: 'character', base: 80, range: [60, 120], exposure: 1.5, philosophy: 'wrathful',
      scope: 'Punish an individual', desc: 'Strike someone down with sudden affliction. Fear spreads.',
    },
    reveal: {
      name: 'Reveal Wrongdoing', tier: 3, target: 'character', base: 160, range: [120, 300], exposure: 0.9,
      scope: 'Expose corruption through a witnessed event', desc: 'Lay bare a hidden misdeed of an official or noble.',
    },
    inspire_leader: {
      name: 'Inspire a Leader', tier: 3, target: 'character', base: 150, range: [150, 400], exposure: 0.4,
      scope: 'Influence a decision or perception', desc: 'Push a leader toward an agenda, or shake their confidence.',
      options: {
        mercy: 'Toward mercy and relief',
        reform: 'Toward reform and openness',
        piety: 'Toward the faith',
        peace: 'Toward peace',
        order: 'Toward order and control',
        embolden: 'Embolden them (legitimacy up)',
        shake: 'Shake their confidence (legitimacy down)',
      },
    },
    regional: {
      name: 'Regional Miracle', tier: 3, target: 'province', base: 500, range: [500, 2000], exposure: 3,
      scope: 'City or large region', desc: 'Bend nature across a whole province.',
      options: {
        calm_waters: { label: 'Calm the flood', cost: 900, needs: 'flood' },
        divert_river: { label: 'Divert the river to the North Fields', cost: 600, needs: 'flood' },
        bountiful_harvest: { label: 'Bountiful harvest', cost: 700 },
        cleanse_plague: { label: 'Cleanse the sickness', cost: 850, needs: 'plague' },
        storm_on_enemy: { label: 'Storm upon the invader', cost: 1100, needs: 'war' },
      },
    },
    national: {
      name: 'National Intervention', tier: 4, target: 'country', base: 2000, range: [2000, 10000], exposure: 6,
      scope: 'Major national event', desc: 'Reshape the course of a nation.',
      options: {
        rally_nation: { label: 'Rally the nation', cost: 3000 },
        forge_peace: { label: 'Forge peace', cost: 2500, needs: 'war' },
        humble_ruler: { label: 'Humble the ruler', cost: 2200 },
      },
    },
    global: {
      name: 'Global Miracle', tier: 4, target: 'country', base: 10000, range: [10000, 20000], exposure: 25,
      scope: 'Planet-wide effect', desc: 'A sign in the heavens that every living soul sees.',
      options: { sign_in_heavens: { label: 'A sign in the heavens', cost: 10000 } },
    },
  };

  G.Data.possession = { base: 30, upkeepPerHour: 15, maxHours: 8, range: 3.5 };

  G.Data.philosophies = {
    compassionate: {
      name: 'Compassionate', desc: 'Protection, healing and reducing suffering. Mercies cost less; people tend to see a protector.',
      costMod: { heal: 0.85, protect: 0.85, provide: 0.85 }, protectorBias: 0.2,
    },
    hidden: {
      name: 'Hidden', desc: 'Subtle influence and secrecy. Exposure is halved; signs and visions are cheaper, spectacle costs more.',
      costMod: { subtle_sign: 0.75, vision: 0.75, inspire: 0.8, regional: 1.15, national: 1.15 }, exposureMod: 0.5,
    },
    wrathful: {
      name: 'Wrathful', desc: 'Fear, punishment and spectacle. Unlocks Smite; belief grows from awe and dread.',
      costMod: { reveal: 0.8, smite: 1 }, fearBias: 0.35,
    },
    independent: {
      name: 'Independent Humanity', desc: 'A world that can thrive without miracles. Passive Faith grows while you abstain; direct miracles cost more.',
      costMod: { heal: 1.1, provide: 1.1, protect: 1.1, inspire: 0.7, vision: 0.9 }, abstainBonus: 1.5,
    },
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
