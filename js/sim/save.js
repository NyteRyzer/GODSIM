// Persistence: versioned JSON saves. Derived lookups are rebuilt on load, never saved.
(function (G) {
  'use strict';
  const S = G.Sim;

  // Migrations from older save versions: { fromVersion: fn(data) -> data }
  const MIGRATIONS = {};

  S.serialize = function (world) {
    return JSON.stringify(world, (key, value) => {
      if (key === 'buildingMap' || key === 'autosaveDue') return undefined;
      return value;
    });
  };

  S.deserialize = function (json) {
    let data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || typeof data !== 'object' || !data.chars || !data.country) throw new Error('Not a GODSIM save file.');
    let v = data.version || 0;
    if (v > G.SAVE_VERSION) throw new Error(`This save is from a newer version of GODSIM (save v${v}, game supports v${G.SAVE_VERSION}).`);
    while (v < G.SAVE_VERSION) {
      const m = MIGRATIONS[v];
      if (!m) throw new Error(`Cannot migrate save from version ${v}.`);
      data = m(data);
      v = data.version;
    }
    const rng = new G.Rng(1);
    rng.state = data.rng && data.rng.state != null ? data.rng.state >>> 0 : (data.seed >>> 0);
    data.rng = rng;
    data.buildingMap = {};
    for (const b of data.buildings) data.buildingMap[b.id] = b;
    return data;
  };

  // Storage abstraction so the same code works in the browser (localStorage) and tests (in-memory).
  S.storage = (function () {
    const mem = {};
    const ls = typeof localStorage !== 'undefined' ? localStorage : null;
    return {
      get: (k) => {
        try {
          return ls ? ls.getItem(k) : mem[k] || null;
        } catch (e) {
          return mem[k] || null;
        }
      },
      set: (k, v) => {
        try {
          if (ls) ls.setItem(k, v);
          else mem[k] = v;
          return true;
        } catch (e) {
          mem[k] = v;
          return false;
        }
      },
      remove: (k) => {
        try {
          if (ls) ls.removeItem(k);
        } catch (e) {
          /* ignore */
        }
        delete mem[k];
      },
    };
  })();

  const KEY = (slot) => `godsim.save.${slot}`;
  S.SLOTS = ['autosave', 'slot1', 'slot2', 'slot3'];

  S.saveToSlot = function (world, slot) {
    const json = S.serialize(world);
    // Keep the previous autosave as a backup to recover from a failed write.
    if (slot === 'autosave') {
      const prev = S.storage.get(KEY('autosave'));
      if (prev) S.storage.set(KEY('autosave.bak'), prev);
    }
    const ok = S.storage.set(KEY(slot), json);
    S.storage.set(
      KEY(slot) + '.meta',
      JSON.stringify({ t: world.t, date: G.Time.format(world), country: world.country.name, gov: world.country.government, savedAt: Date.now(), size: json.length })
    );
    return ok;
  };

  S.loadFromSlot = function (slot) {
    const json = S.storage.get(KEY(slot));
    if (!json) return null;
    try {
      return S.deserialize(json);
    } catch (e) {
      if (slot === 'autosave') {
        const bak = S.storage.get(KEY('autosave.bak'));
        if (bak) return S.deserialize(bak);
      }
      throw e;
    }
  };

  S.slotMeta = function (slot) {
    try {
      return JSON.parse(S.storage.get(KEY(slot) + '.meta') || 'null');
    } catch (e) {
      return null;
    }
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
