'use strict';

/**
 * A one-glyph visual cue for concrete words.
 *
 * Pictures do help vocabulary stick, but the mechanism is distinctiveness
 * rather than photography — a memorable, non-verbal second trace alongside the
 * word. An emoji buys most of that for zero bytes, works offline, needs no
 * licence bookkeeping, and cannot go stale. Fetching a thousand photographs
 * would have bought a little more at the cost of ~30 MB in the offline cache;
 * the recordings already in the repo are the better second channel for an exam
 * that tests listening and speaking.
 *
 * Scope is deliberately narrow. A cue is only attached where it is unambiguous
 * — concrete nouns, mostly things you can point at. Abstract words get no cue
 * rather than a decorative one, because a glyph that does not mean the word is
 * worse than no glyph: it is a competing trace.
 *
 * The table is keyed on the English gloss LOD publishes, which the language
 * rule leaves free to author. No Luxembourgish is involved.
 */

/**
 * Exact-gloss matches, tried first. Keyed on the lowercased English gloss with
 * any leading article stripped ("to eat" → "eat", "the sun" → "sun").
 */
const EXACT = {
  // body
  eye: '👁️', eyes: '👁️', ear: '👂', nose: '👃', mouth: '👄', hand: '✋', arm: '💪', leg: '🦵',
  foot: '🦶', head: '🧠', hair: '💇', tooth: '🦷', teeth: '🦷', heart: '❤️', finger: '👆', back: '🔙',
  knee: '🦵', shoulder: '💪', thumb: '👍', blood: '🩸', bone: '🦴', brain: '🧠', lung: '🫁', skin: '🖐️',
  // people and family
  family: '👪', mother: '👩', father: '👨', child: '🧒', children: '🧒', son: '👦', daughter: '👧',
  brother: '👦', sister: '👧', baby: '👶', friend: '🧑‍🤝‍🧑', man: '👨', woman: '👩', wife: '👰',
  husband: '🤵', grandmother: '👵', grandfather: '👴', neighbour: '🏘️', neighbor: '🏘️',
  grandma: '👵', granny: '👵', grandpa: '👴', grandad: '👴', granddad: '👴', grandson: '👦',
  granddaughter: '👧', boy: '👦', girl: '👧', cousin: '🧑', aunt: '👩', uncle: '👨', nephew: '👦',
  niece: '👧', parents: '👪', colleague: '🧑‍🤝‍🧑', 'work colleague': '🧑‍🤝‍🧑', inhabitant: '🏘️',
  customer: '🛒', client: '🛒', guest: '🙋', neighbours: '🏘️', couple: '💑', twin: '👯',
  // food and drink
  bread: '🍞', water: '💧', coffee: '☕', tea: '🍵', milk: '🥛', beer: '🍺', wine: '🍷', cheese: '🧀',
  meat: '🥩', fish: '🐟', egg: '🥚', apple: '🍎', banana: '🍌', strawberry: '🍓', strawberries: '🍓',
  potato: '🥔', tomato: '🍅', salad: '🥗', soup: '🍲', cake: '🍰', chocolate: '🍫', sugar: '🍬',
  salt: '🧂', butter: '🧈', rice: '🍚', pasta: '🍝', ice: '🧊', juice: '🧃', breakfast: '🥐',
  lunch: '🍽️', dinner: '🍽️', restaurant: '🍽️', kitchen: '🍳', plate: '🍽️', glass: '🥛', cup: '☕',
  pineapple: '🍍', apricot: '🍑', pear: '🍐', peach: '🍑', cherry: '🍒', grape: '🍇', lemon: '🍋',
  orange: '🍊', melon: '🍈', plum: '🍑', raspberry: '🫐', blueberry: '🫐', nut: '🌰',
  aubergine: '🍆', courgette: '🥒', cucumber: '🥒', carrot: '🥕', onion: '🧅', garlic: '🧄',
  bean: '🫘', beans: '🫘', pea: '🫛', peas: '🫛', mushroom: '🍄', cauliflower: '🥦', broccoli: '🥦',
  cabbage: '🥬', lettuce: '🥬', corn: '🌽', pepper: '🫑', baguette: '🥖', croissant: '🥐',
  dessert: '🍮', 'apple turnover': '🥧', biscuit: '🍪', honey: '🍯', jam: '🍓', sausage: '🌭',
  ham: '🥓', chicken: '🍗', soft_drink: '🥤', pub: '🍺', bar: '🍸', cafe: '☕', 'café': '☕',
  // clothes
  shoe: '👟', shoes: '👟', shirt: '👕', trousers: '👖', dress: '👗', coat: '🧥', jacket: '🧥',
  hat: '🎩', sock: '🧦', socks: '🧦', glove: '🧤', gloves: '🧤', scarf: '🧣', skirt: '👗',
  boot: '🥾', boots: '🥾', tie: '👔', belt: '👜', pullover: '🧶', jumper: '🧶', suit: '🤵',
  swimsuit: '🩱', pyjamas: '🛌', umbrella: '☂️', ring: '💍', glasses: '👓', bag: '👜',
  // colours
  blue: '🔵', red: '🔴', green: '🟢', yellow: '🟡', black: '⚫', white: '⚪', brown: '🟤',
  grey: '⚪', gray: '⚪', pink: '🩷', purple: '🟣', blond: '👱', colour: '🎨', color: '🎨',
  // months
  january: '📅', february: '📅', march: '📅', april: '📅', may: '📅', june: '📅', july: '📅',
  august: '📅', september: '📅', october: '📅', november: '📅', december: '📅',
  // home
  house: '🏠', home: '🏠', flat: '🏢', apartment: '🏢', room: '🚪', door: '🚪', window: '🪟',
  table: '🪑', chair: '🪑', bed: '🛏️', garden: '🌳', bathroom: '🛁', key: '🔑', lamp: '💡',
  // transport
  car: '🚗', train: '🚆', bus: '🚌', bicycle: '🚲', bike: '🚲', plane: '✈️', aeroplane: '✈️',
  airplane: '✈️', boat: '⛵', ship: '🚢', street: '🛣️', road: '🛣️', station: '🚉', ticket: '🎫',
  // nature and weather
  sun: '☀️', rain: '🌧️', snow: '❄️', wind: '💨', cloud: '☁️', tree: '🌳', flower: '🌸',
  weather: '🌤️', winter: '❄️', summer: '☀️', spring: '🌷', autumn: '🍂', sea: '🌊', mountain: '⛰️',
  sky: '🌌', moon: '🌙', star: '⭐', fire: '🔥', forest: '🌲', river: '🏞️',
  overcast: '☁️', cloudy: '☁️', fog: '🌫️', foggy: '🌫️', storm: '⛈️', thunder: '⛈️',
  lightning: '⚡', frost: '🥶', hot: '🔥', warm: '☀️', cold: '🥶', rainbow: '🌈', puddle: '💧',
  // animals
  dog: '🐕', cat: '🐈', horse: '🐎', bird: '🐦', cow: '🐄', pig: '🐖', sheep: '🐑',
  monkey: '🐒', mouse: '🐁', bee: '🐝', duck: '🦆', goat: '🐐', rabbit: '🐇', fox: '🦊',
  wolf: '🐺', bear: '🐻', frog: '🐸', spider: '🕷️', butterfly: '🦋', snake: '🐍', hen: '🐔',
  // work, school, media
  work: '💼', office: '🏢', money: '💶', shop: '🏪', bank: '🏦', school: '🏫', book: '📖',
  newspaper: '📰', letter: '✉️', pen: '🖊️', paper: '📄', computer: '💻', telephone: '📞',
  phone: '📱', television: '📺', radio: '📻', internet: '🌐', film: '🎬', music: '🎵', photo: '📷',
  camera: '📷', hospital: '🏥', doctor: '👨‍⚕️', church: '⛪', city: '🏙️', town: '🏙️', village: '🏡',
  pencil: '✏️', folder: '📁', ruler: '📏', rubber: '🧽', eraser: '🧽', schoolbag: '🎒',
  blackboard: '📋', 'exercise book': '📓', notebook: '📓', scissors: '✂️', glue: '🧴',
  architect: '📐', babysitter: '👶', cleaner: '🧹', postman: '📮', postwoman: '📮',
  cashier: '💰', hairdresser: '💇', vet: '🐕‍🦺', headmaster: '👩‍🏫', headmistress: '👩‍🏫',
  chemist: '💊', "chemist's": '💊', pharmacy: '💊', engineer: '👷', secretary: '🗂️',
  waiter: '🍽️', waitress: '🍽️', mechanic: '🔧', journalist: '📰', dentist: '🦷', pilot: '✈️',
  soldier: '🎖️', butcher: '🥩', gardener: '🌱', electrician: '💡', plumber: '🔧',
  painter: '🎨', musician: '🎵', actor: '🎭', actress: '🎭', writer: '✍️', student: '🎓',
  pupil: '🎓', teacher: '👩‍🏫', nurse: '👩‍⚕️', farmer: '🧑‍🌾', baker: '🥖', lawyer: '⚖️',
  policeman: '👮', policewoman: '👮', driver: '🚗', cook: '🍳', boss: '💼',
  // time and abstract-but-unambiguous
  clock: '🕐', watch: '⌚', time: '⏰', day: '🌞', night: '🌙', week: '📅', month: '📅', year: '📅',
  birthday: '🎂', gift: '🎁', present: '🎁', party: '🎉', christmas: '🎄', holiday: '🏖️',
  holidays: '🏖️', suitcase: '🧳', hotel: '🏨', map: '🗺️', football: '⚽', sport: '🏃', game: '🎲',
  'christmas tree': '🎄', 'christmas day': '🎄', 'christmas market': '🎄', 'christmas eve': '🎄',
  easter: '🐣', carnival: '🎭', 'new year': '🎆', wedding: '💒', aerobics: '🤸',
  swimming: '🏊', cycling: '🚴', tennis: '🎾', basketball: '🏀', running: '🏃', dancing: '💃',
  // household
  soap: '🧼', laundry: '🧺', rubbish: '🗑️', broom: '🧹', washing: '🧺',
  towel: '🧻', bucket: '🪣', vacuum: '🧹', dust: '🧹', dishwasher: '🍽️', fridge: '🧊',
  oven: '🍳', cooker: '🍳', knife: '🔪', fork: '🍴', spoon: '🥄', pan: '🍳', bottle: '🍾',
  // long tail worth naming explicitly
  yoghurt: '🥛', yogurt: '🥛', kiwi: '🥝', mango: '🥭', pumpkin: '🎃', chef: '🍳',
  translator: '🌐', apprentice: '🎓', mummy: '👩', daddy: '👨', candle: '🕯️', season: '🌤️',
  cough: '🤧', sweet: '🍬', sweets: '🍬', canteen: '🍽️', ketchup: '🍅', 'chewing gum': '🍬',
  ill: '🤒', fever: '🤒', headache: '🤕', bachelor: '🤵', flour: '🌾',
};

/**
 * Substring fallbacks, tried in order when no exact gloss matches. Kept short
 * on purpose — every entry here is a chance to attach the wrong picture.
 */
const CONTAINS = [
  ['month', '📅'], ['doctor', '👨‍⚕️'], ['teacher', '👩‍🏫'], ['nurse', '👩‍⚕️'], ['driver', '🚗'],
  ['cook', '🍳'], ['baker', '🥖'], ['police', '👮'], ['farmer', '🧑‍🌾'], ['lawyer', '⚖️'],
  ['shop', '🏪'], ['bread', '🍞'], ['fruit', '🍎'], ['vegetable', '🥕'], ['drink', '🥤'],
  ['clothes', '👕'], ['shoe', '👟'], ['train', '🚆'], ['car', '🚗'], ['book', '📖'],
  ['computer', '💻'], ['cake', '🍰'], ['school', '🏫'], ['juice', '🧃'], ['soup', '🍲'],
];

/**
 * The categories a cue may be attached to. Restricting by LOD's own semantic
 * categories is what keeps the table from creeping onto abstract nouns: the
 * gloss "interest" is concrete in a bank and abstract in a conversation, and
 * only the category can tell the two apart.
 */
const CUEABLE_CATEGORIES = new Set([
  'IESSEN', 'GEDRENKS', 'UEBST', 'GEMEIS', 'GEWIERZ', 'KRAUTGEWIERZ', 'NOSS', 'FESCH',
  'KLEEDUNGSSTECK', 'DEIER', 'PLANTE', 'BLUMM', 'GEFIER', 'ANAT', 'MOUNT', 'FAARF',
  'MUSEKSINSTRUMENT', 'SPORT', 'FUSSBALL', 'BERUFFSBEZEECHNUNG', 'FAMILL', 'PERSOUN',
  'METEO', 'WIEDER', 'HORECA', 'SPILLPLAZ', 'FEIERDEEG', 'FEST', 'MED', 'SCHOUL', 'TECH',
]);

/** Strips the articles and infinitive markers LOD glosses carry. */
function normaliseGloss(gloss) {
  return String(gloss)
    .toLowerCase()
    .replace(/^(to|the|a|an)\s+/, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .trim();
}

/**
 * The cue for a corpus entry, or `null`.
 *
 * @param {object} entry corpus entry: `{ categories, glosses }`
 * @returns {string|null}
 */
function cueFor(entry) {
  const categories = entry.categories ?? [];
  if (!categories.some((name) => CUEABLE_CATEGORIES.has(name))) return null;

  const glosses = (entry.glosses?.en ?? []).map(normaliseGloss).filter(Boolean);
  for (const gloss of glosses) {
    if (EXACT[gloss]) return EXACT[gloss];
  }
  for (const gloss of glosses) {
    for (const [needle, emoji] of CONTAINS) {
      if (gloss.includes(needle)) return emoji;
    }
  }
  return null;
}

module.exports = { cueFor, normaliseGloss, EXACT, CONTAINS, CUEABLE_CATEGORIES };
