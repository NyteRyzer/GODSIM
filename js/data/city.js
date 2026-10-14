// The capital city of the MVP scenario. Layout is data so new settlements can be added without touching the simulation.
(function (G) {
  'use strict';

  const homes = [];
  let n = 1;
  for (const y of [26, 31, 36]) {
    for (const x of [2, 7, 12, 17, 22, 27, 32]) {
      homes.push({ id: 'home' + n, name: 'House ' + n, type: 'home', x, y, w: 4, h: 3 });
      n++;
    }
  }
  const farmhouses = [
    [42, 11], [46, 15], [42, 19], [47, 23], [42, 27], [46, 31], [42, 35],
  ].map(([x, y], i) => ({ id: 'farm' + (i + 1), name: 'Farmhouse ' + (i + 1), type: 'farmhouse', x, y, w: 4, h: 3 }));
  farmhouses.push({ id: 'upland', name: 'Upland Farm', type: 'farmhouse', x: 53, y: 3, w: 4, h: 3 });

  G.Data.city = {
    name: 'Thornhaven',
    width: 60,
    height: 40,
    river: { x0: 37, x1: 39 },
    bridges: [{ y0: 9, y1: 10 }, { y0: 28, y1: 29 }],
    // Floodplain on the east bank; North Fields are where a diverted river would go.
    floodplain: { x0: 40, x1: 50, y0: 10, y1: 39 },
    northFields: { x0: 40, x1: 59, y0: 0, y1: 8 },
    roads: [
      { x0: 0, y0: 9, x1: 59, y1: 10 },
      { x0: 0, y0: 24, x1: 36, y1: 24 },
      { x0: 13, y0: 0, x1: 13, y1: 39 },
      { x0: 24, y0: 0, x1: 24, y1: 24 },
      { x0: 36, y0: 10, x1: 36, y1: 39 },
      { x0: 40, y0: 28, x1: 51, y1: 29 },
      { x0: 51, y0: 9, x1: 51, y1: 39 },
    ],
    zones: [
      { id: 'north_fields', name: 'North Fields', type: 'field', x: 41, y: 0, w: 19, h: 9 },
      { id: 'river_fields', name: 'Riverside Fields', type: 'field', x: 52, y: 11, w: 8, h: 28 },
    ],
    buildings: [
      { id: 'palace', name: 'Royal Palace', type: 'palace', x: 1, y: 1, w: 11, h: 7, guarded: true },
      { id: 'manor', name: 'Crane Manor', type: 'manor', x: 15, y: 1, w: 7, h: 6 },
      { id: 'barracks', name: 'Barracks & Gaol', type: 'barracks', x: 26, y: 1, w: 9, h: 6 },
      { id: 'healer', name: "Healer's House", type: 'healer', x: 1, y: 12, w: 6, h: 4 },
      { id: 'temple', name: 'Temple of the Unseen Flame', type: 'temple', x: 14, y: 12, w: 9, h: 7, shelter: true },
      { id: 'market', name: 'Market Square', type: 'market', x: 25, y: 12, w: 10, h: 7 },
      { id: 'academy', name: 'Royal Academy', type: 'academy', x: 1, y: 18, w: 8, h: 5 },
      { id: 'tavern', name: 'The Copper Kettle', type: 'tavern', x: 26, y: 20, w: 8, h: 3 },
      ...homes,
      ...farmhouses,
    ],
    districts: [
      { id: 'palace', name: 'Palace Quarter', x0: 0, y0: 0, x1: 36, y1: 8 },
      { id: 'oldtown', name: 'Old Town', x0: 0, y0: 25, x1: 36, y1: 39 },
      { id: 'center', name: 'Temple & Market', x0: 0, y0: 9, x1: 36, y1: 24 },
      { id: 'northfields', name: 'North Fields', x0: 40, y0: 0, x1: 59, y1: 8 },
      { id: 'riverside', name: 'Riverside Farms', x0: 40, y0: 9, x1: 59, y1: 39 },
    ],
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
