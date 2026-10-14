// Government types, factions and leader decisions as data.
(function (G) {
  'use strict';

  G.Data.governments = {
    monarchy: {
      name: 'Absolute Monarchy', leaderTitle: 'Monarch', mechanics: 'Dynasty, succession, nobles, inheritance',
      influence: 'Influence heirs, create visions, alter legitimacy or succession pressures', drift: { inequality: 0.04, corruption: 0.03 },
    },
    constitutional: {
      name: 'Constitutional Monarchy', leaderTitle: 'Monarch', mechanics: 'Crown bound by a charter, an assembly advises',
      influence: 'Shape the assembly and the crown alike', drift: { inequality: 0.0, corruption: 0.0 },
    },
    democracy: {
      name: 'Parliamentary Democracy', leaderTitle: 'First Minister', mechanics: 'Elections, parties, institutions, public opinion', elections: 120,
      influence: 'Inspire reformers, affect legitimacy, expose corruption through events', drift: { inequality: -0.03, corruption: -0.02 },
    },
    republic: {
      name: 'Presidential Republic', leaderTitle: 'President', mechanics: 'Executive, legislature, courts, elections', elections: 150,
      influence: 'Influence leaders, institutional trust and political crises', drift: { inequality: -0.02, corruption: 0.01 },
    },
    dictatorship: {
      name: 'Military Dictatorship', leaderTitle: 'Lord Protector', mechanics: 'Ruler or ruling group, coercion, elite loyalty',
      influence: 'Strengthen or undermine a ruler, influence defections or coups', drift: { inequality: 0.05, corruption: 0.06 },
    },
    theocracy: {
      name: 'Theocratic State', leaderTitle: 'Hierarch', mechanics: 'Religious authority, doctrine as law, factional conflict',
      influence: 'Inspire movements, shape religious policy, create schisms or alliances', drift: { inequality: 0.02, corruption: 0.02 },
    },
    revolutionary: {
      name: 'Revolutionary Committee', leaderTitle: 'Chair of the Committee', mechanics: 'Ideological movement, factional conflict',
      influence: 'Inspire movements, sway the committee', drift: { inequality: -0.05, corruption: 0.03 },
    },
  };

  G.Data.factions = [
    { id: 'crown', name: 'The Crown', agenda: 'order' },
    { id: 'nobility', name: 'The Nobility', agenda: 'privilege' },
    { id: 'clergy', name: 'The Clergy', agenda: 'piety' },
    { id: 'military', name: 'The Army', agenda: 'order' },
    { id: 'reformers', name: 'The Reformers', agenda: 'reform' },
    { id: 'commons', name: 'The Commons', agenda: 'mercy' },
  ];

  // Leader decisions. Each option has tags (matched against leader traits and divine inspiration) and effects.
  G.Data.decisions = {
    flood_relief: {
      title: 'Response to the Riverlands flood',
      options: [
        { id: 'send_soldiers', label: 'Send soldiers to evacuate the farms', tags: ['mercy'], effects: { legitimacy: 6, treasury: -8, security: -3 }, factions: { commons: 8, military: -2 }, flag: 'rescue' },
        { id: 'protect_capital', label: 'Fortify the capital, leave the farms', tags: ['order'], effects: { legitimacy: -5, eliteLoyalty: 3 }, factions: { commons: -8, nobility: 4 } },
        { id: 'public_prayer', label: 'Call the realm to public prayer', tags: ['piety'], effects: { religiousInfluence: 6, legitimacy: 1 }, factions: { clergy: 8 } },
      ],
    },
    reform_petition: {
      title: 'The Reformers petition for a charter',
      options: [
        { id: 'grant_charter', label: 'Grant a constitutional charter', tags: ['reform', 'mercy', 'peace'], effects: { legitimacy: 4, reformPressure: -35, eliteLoyalty: -8 }, factions: { reformers: 15, nobility: -10, commons: 8 }, transition: 'constitutional' },
        { id: 'refuse', label: 'Refuse politely', tags: ['order'], effects: { reformPressure: 8, legitimacy: -3 }, factions: { reformers: -8 } },
        { id: 'crackdown', label: 'Arrest the ringleaders', tags: ['order', 'war'], effects: { security: 6, legitimacy: -8, reformPressure: -10, grievance: 15 }, factions: { reformers: -20, military: 5, commons: -6 }, flag: 'arrests' },
      ],
    },
    tax_policy: {
      title: 'The treasury runs low',
      options: [
        { id: 'tax_commons', label: 'Raise taxes on the commons', tags: ['order'], effects: { treasury: 15, inequality: 4, legitimacy: -4 }, factions: { commons: -10, nobility: 3 } },
        { id: 'tax_nobles', label: 'Tax the great estates', tags: ['reform', 'mercy'], effects: { treasury: 12, inequality: -5, eliteLoyalty: -7 }, factions: { nobility: -12, commons: 8, reformers: 5 } },
        { id: 'church_tithe', label: 'Borrow from the Temple treasury', tags: ['piety'], effects: { treasury: 10, religiousInfluence: 4 }, factions: { clergy: -4 } },
      ],
    },
    church_privileges: {
      title: 'The High Priestess asks for temple lands',
      options: [
        { id: 'grant_lands', label: 'Grant the lands', tags: ['piety'], effects: { religiousInfluence: 8, treasury: -4 }, factions: { clergy: 12, nobility: -5 } },
        { id: 'deny', label: 'Deny the request', tags: ['order', 'reform'], effects: { religiousInfluence: -4 }, factions: { clergy: -10, reformers: 3 } },
      ],
    },
    war_response: {
      title: 'Kesh troops mass on the Highmarch border',
      options: [
        { id: 'mobilize', label: 'Mobilize the army', tags: ['war', 'order'], effects: { security: 10, treasury: -10, economy: -3 }, factions: { military: 10 }, flag: 'mobilize' },
        { id: 'negotiate', label: 'Send envoys to negotiate', tags: ['peace', 'reform'], effects: { warRisk: -25, legitimacy: -1 }, factions: { military: -5, commons: 3 } },
        { id: 'concede', label: 'Concede border tolls', tags: ['peace', 'mercy'], effects: { warRisk: -40, treasury: -8, legitimacy: -5 }, factions: { nobility: -6, military: -8 } },
      ],
    },
    famine_relief: {
      title: 'Hunger spreads in the city',
      options: [
        { id: 'open_granaries', label: 'Open the royal granaries', tags: ['mercy'], effects: { treasury: -8, legitimacy: 5 }, factions: { commons: 10 }, flag: 'granaries' },
        { id: 'blame_merchants', label: 'Blame hoarding merchants', tags: ['order'], effects: { legitimacy: 1, economy: -3 }, factions: { commons: 2 } },
      ],
    },
  };

  G.Data.neighbors = [
    { id: 'kesh', name: 'Kesh Dominion', government: 'dictatorship', strength: 58, relation: -35, aggression: 0.7, color: '#8a4b3a' },
    { id: 'ostmark', name: 'Ostmark League', government: 'republic', strength: 45, relation: 25, aggression: 0.2, color: '#4b6a8a' },
  ];
})((globalThis.GODSIM = globalThis.GODSIM || {}));
