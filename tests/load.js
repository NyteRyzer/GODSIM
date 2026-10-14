// Loads the simulation (no UI) into Node, in the same order as index.html.
const path = require('path');
const FILES = [
  'js/core/base.js',
  'js/data/city.js', 'js/data/abilities.js', 'js/data/politics.js', 'js/data/scenarios.js',
  'js/sim/world.js', 'js/sim/characters.js', 'js/sim/faith.js', 'js/sim/religion.js', 'js/sim/interventions.js',
  'js/sim/crises.js', 'js/sim/politics.js', 'js/sim/prayers.js', 'js/sim/forms.js', 'js/sim/sim.js', 'js/sim/save.js',
];
for (const f of FILES) require(path.join(__dirname, '..', f));
module.exports = globalThis.GODSIM;
module.exports.FILES = FILES;
