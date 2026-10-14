// Scenario, era and challenge definitions.
(function (G) {
  'use strict';

  G.Data.names = {
    male: ['Hobb', 'Tam', 'Edric', 'Oswin', 'Bram', 'Cedric', 'Dunstan', 'Ewan', 'Fenn', 'Garret', 'Hugh', 'Ivo', 'Jory', 'Kester', 'Leof', 'Merrick', 'Ned', 'Osric', 'Piers', 'Quill', 'Rowan', 'Silas', 'Tobin', 'Ulric', 'Wat', 'Alder', 'Beck', 'Colm', 'Davin', 'Emrys'],
    female: ['Lissa', 'Wren', 'Nell', 'Maren', 'Ysolde', 'Imra', 'Agnes', 'Brida', 'Cora', 'Della', 'Elsbeth', 'Fae', 'Gwen', 'Hild', 'Ines', 'Jessa', 'Kit', 'Lark', 'Mab', 'Nia', 'Orla', 'Petra', 'Rhosyn', 'Sabine', 'Tilda', 'Una', 'Vera', 'Willa', 'Ada', 'Bess'],
    last: ['Brannoc', 'Ashby', 'Miller', 'Fletcher', 'Cooper', 'Hale', 'Marsh', 'Thatcher', 'Reed', 'Coll', 'Dunmore', 'Fairweather', 'Greaves', 'Harrow', 'Ives', 'Kemp', 'Lowe', 'Moss', 'Nettle', 'Orme', 'Penn', 'Quarry', 'Rook', 'Salt', 'Tanner', 'Underhill', 'Vane', 'Webb', 'Yarrow', 'Wick'],
  };

  G.Data.eras = [
    { id: 'dawn', name: 'Dawn of Civilization', start: 'Tribal societies, early cities, agriculture, oral traditions', themes: 'Founding religions, sacred places, early kingdoms', available: false },
    { id: 'kingdoms', name: 'Kingdoms and Empires', start: 'Monarchies, dynasties, organized religions, trade', themes: 'Succession, faith institutions, imperial expansion', available: true },
    { id: 'industry', name: 'Industry and Revolution', start: 'Industrialization, mass literacy, nationalism', themes: 'Revolutions, secularization, modern state formation', available: false },
    { id: 'contemporary', name: 'Contemporary World', start: 'Nation-states, elections, media, global markets', themes: 'Ideology, diplomacy, mass communication, modern crises', available: false },
    { id: 'future', name: 'The Future', start: 'Advanced medicine, AI, space expansion', themes: 'Post-scarcity, new forms of belief, scientific scrutiny', available: false },
  ];

  G.Data.scenarios = {
    river_kingdom: {
      id: 'river_kingdom',
      name: 'The River Miracle',
      era: 'kingdoms',
      blurb: 'The Kingdom of Velmora, 1712. King Aldric is losing legitimacy, reformers gather in the taverns, and the spring rains are swelling the river. Faith is limited: you cannot save everyone.',
      calendar: { baseYear: 1712, startDay: 60, startHour: 6 },
      startFaith: 120,
      country: {
        name: 'Kingdom of Velmora', government: 'monarchy', treasury: 45,
        legitimacy: 38, institutionalTrust: 42, eliteLoyalty: 52, economy: 46, inequality: 64, corruption: 56,
        security: 50, religiousInfluence: 55, reformPressure: 46, warRisk: 18, literacy: 22, technology: 10,
        factions: { crown: [70, 70], nobility: [60, 55], clergy: [55, 60], military: [55, 58], reformers: [30, 25], commons: [40, 38] },
      },
      church: { name: 'Church of the Unseen Flame', doctrine: 'protector', strength: 58 },
      provinces: [
        { id: 'crownlands', name: 'Crownlands', pop: 42, belief: 46, economy: 50, unrest: 30, local: true },
        { id: 'riverlands', name: 'Riverlands', pop: 28, belief: 58, economy: 44, unrest: 28 },
        { id: 'highmarch', name: 'Highmarch', pop: 19, belief: 40, economy: 40, unrest: 35, border: 'kesh' },
        { id: 'saltcoast', name: 'Saltcoast', pop: 23, belief: 34, economy: 56, unrest: 25, border: 'ostmark' },
      ],
      keyCharacters: [
        { key: 'king', first: 'Aldric', last: 'Velmorne', title: 'King', sex: 'm', age: 63, role: 'monarch', occupation: 'King of Velmora', home: 'palace', work: 'palace', faction: 'crown', belief: 52, traits: { kindness: 0.4, courage: 0.5, ambition: 0.65, piety: 0.55, skepticism: 0.25, caution: 0.6 }, health: 78, wealth: 100 },
        { key: 'heir', first: 'Maren', last: 'Velmorne', title: 'Princess', sex: 'f', age: 24, role: 'heir', occupation: 'Heir to the throne', home: 'palace', work: 'palace', faction: 'crown', belief: 44, traits: { kindness: 0.7, courage: 0.6, ambition: 0.55, piety: 0.45, skepticism: 0.4, caution: 0.55 }, wealth: 100 },
        { key: 'noble', first: 'Halvard', last: 'Crane', title: 'Lord', sex: 'm', age: 45, role: 'noble', occupation: 'Lord of Crane Manor', home: 'manor', work: 'manor', faction: 'nobility', belief: 30, traits: { kindness: 0.25, courage: 0.55, ambition: 0.9, piety: 0.3, skepticism: 0.6, caution: 0.5 }, wealth: 95 },
        { key: 'priestess', first: 'Ysolde', last: 'Marsh', title: 'High Priestess', sex: 'f', age: 52, role: 'priest', occupation: 'High Priestess', home: 'temple', work: 'temple', faction: 'clergy', belief: 86, traits: { kindness: 0.55, courage: 0.5, ambition: 0.65, piety: 0.95, skepticism: 0.05, caution: 0.5 }, wealth: 70 },
        { key: 'acolyte', first: 'Edric', last: 'Fairweather', title: 'Brother', sex: 'm', age: 29, role: 'priest', occupation: 'Acolyte', home: 'temple', work: 'temple', faction: 'clergy', belief: 72, traits: { kindness: 0.75, courage: 0.45, ambition: 0.3, piety: 0.8, skepticism: 0.15, caution: 0.5 }, wealth: 30 },
        { key: 'general', first: 'Corvin', last: 'Thane', title: 'General', sex: 'm', age: 48, role: 'general', occupation: 'General of the Army', home: 'barracks', work: 'barracks', faction: 'military', belief: 38, traits: { kindness: 0.45, courage: 0.85, ambition: 0.72, piety: 0.35, skepticism: 0.45, caution: 0.4 }, wealth: 75 },
        { key: 'reformer', first: 'Tobias', last: 'Vell', title: '', sex: 'm', age: 34, role: 'reformer', occupation: 'Printer & pamphleteer', home: 'tavern', work: 'tavern', faction: 'reformers', belief: 24, traits: { kindness: 0.7, courage: 0.7, ambition: 0.6, piety: 0.2, skepticism: 0.6, caution: 0.3 }, wealth: 30 },
        { key: 'healer', first: 'Nell', last: 'Ashby', title: '', sex: 'f', age: 41, role: 'healer', occupation: 'Healer', home: 'healer', work: 'healer', faction: 'commons', belief: 61, gift: true, traits: { kindness: 0.9, courage: 0.6, ambition: 0.2, piety: 0.6, skepticism: 0.2, caution: 0.4 }, wealth: 35 },
        { key: 'magistrate', first: 'Oswin', last: 'Pike', title: 'Magistrate', sex: 'm', age: 50, role: 'official', occupation: 'Royal Magistrate', home: 'home1', work: 'palace', faction: 'crown', belief: 35, traits: { kindness: 0.3, courage: 0.35, ambition: 0.7, piety: 0.35, skepticism: 0.4, caution: 0.7 }, wealth: 80, corrupt: true },
        { key: 'scholar', first: 'Imra', last: 'Solace', title: 'Doctor', sex: 'f', age: 38, role: 'scholar', occupation: 'Natural philosopher', home: 'academy', work: 'academy', faction: 'reformers', belief: 14, traits: { kindness: 0.55, courage: 0.5, ambition: 0.6, piety: 0.1, skepticism: 0.85, caution: 0.55 }, wealth: 50 },
        // The family trapped by the flood in the sample scenario.
        { key: 'hobb', first: 'Hobb', last: 'Brannoc', sex: 'm', age: 36, role: 'farmer', occupation: 'Farmer', home: 'farm3', work: 'river_fields', faction: 'commons', belief: 63, traits: { kindness: 0.6, courage: 0.55, ambition: 0.3, piety: 0.65, skepticism: 0.2, caution: 0.35 }, wealth: 22, family: 'brannoc' },
        { key: 'lissa', first: 'Lissa', last: 'Brannoc', sex: 'f', age: 33, role: 'farmer', occupation: 'Farmer', home: 'farm3', work: 'river_fields', faction: 'commons', belief: 70, traits: { kindness: 0.7, courage: 0.4, ambition: 0.3, piety: 0.75, skepticism: 0.15, caution: 0.6 }, wealth: 22, family: 'brannoc' },
        { key: 'tam', first: 'Tam', last: 'Brannoc', sex: 'm', age: 9, role: 'child', occupation: 'Child', home: 'farm3', work: null, faction: 'commons', belief: 55, traits: { kindness: 0.6, courage: 0.7, ambition: 0.4, piety: 0.5, skepticism: 0.2, caution: 0.2 }, wealth: 22, family: 'brannoc' },
        { key: 'wren', first: 'Wren', last: 'Brannoc', sex: 'f', age: 6, role: 'child', occupation: 'Child', home: 'farm3', work: null, faction: 'commons', belief: 60, traits: { kindness: 0.7, courage: 0.4, ambition: 0.3, piety: 0.6, skepticism: 0.1, caution: 0.5 }, wealth: 22, family: 'brannoc' },
      ],
      // Authored opening crisis; later floods, plagues and wars emerge from simulation variables.
      openingEvents: [
        { delayHours: 12, type: 'flood_warning', data: { severity: 1 } },
        { delayHours: 3, type: 'ill_child', data: {} },
      ],
      householdHomes: { west: 13, east: 6 },
    },
  };

  G.Data.challenges = {
    none: { name: 'Sandbox', desc: 'No objectives. Shape history however you wish.' },
    silent: {
      name: 'The Silent Decade', desc: 'Keep the Church strong (≥ 45) for two years while Divine Exposure stays at or below 20.',
      days: 720,
    },
    empire: {
      name: 'Empire of Faith', desc: 'Raise Religious Influence to 85 and hold it for 60 days, without ever possessing the ruler.',
    },
    brink: {
      name: 'World on the Brink', desc: 'Flood, plague and war in the first year. Keep national Stability above 25 for one year.',
      days: 360,
    },
    handsoff: {
      name: 'Hands-Off God', desc: 'Guide the kingdom for one year using at most 8 direct miracles, ending with Stability ≥ 45.',
      days: 360, maxMiracles: 8,
    },
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
