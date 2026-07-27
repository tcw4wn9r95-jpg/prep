'use strict';

/**
 * The exam topic taxonomy.
 *
 * The A2 interview topic pool is not something we get to invent. This list is
 * the union of the pool in the project brief and the topic sheets INLL
 * actually issues (Sport, Iessen, Vakanz, Transport, Gesondheet, Sproochen,
 * Kaddoen, Kleeder, Feierdeeg, Wanterzäit, Stot a botzen, Wou ech wunnen,
 * Technologie/Internet/Medien, Musek/Filmer, Hobbyen, meng Aarbecht …).
 *
 * `seeds` are LOD headwords. build-items.js resolves every one of them against
 * content/corpus.json and **fails the build if any is missing** - that is what
 * stops a topic from quietly being seeded with a word nobody verified.
 *
 * Topic names are given in Luxembourgish as LOD spells them (each `lb` value
 * is itself a corpus headword or a compound of them) plus English and French
 * labels, which we are free to write.
 */

const TOPICS = [
  {
    id: 'sport',
    lb: 'Sport',
    en: 'Sport',
    fr: 'Sport',
    seeds: ['Sport', 'Fussball', 'spillen', 'lafen', 'schwammen', 'Training'],
  },
  {
    id: 'aarbecht',
    lb: 'Aarbecht',
    en: 'Work',
    fr: 'Travail',
    seeds: ['Aarbecht', 'schaffen', 'Büro', 'Chef', 'Kolleeg', 'Beruff'],
  },
  {
    id: 'vakanz',
    lb: 'Vakanz',
    en: 'Travel and holidays',
    fr: 'Voyages et vacances',
    seeds: ['Vakanz', 'reesen', 'Rees', 'Hotel', 'Fliger', 'Mier'],
  },
  {
    id: 'gesondheet',
    lb: 'Gesondheet',
    en: 'Healthy living',
    fr: 'Vivre sainement',
    seeds: ['Gesondheet', 'krank', 'Dokter', 'Spidol', 'Sport', 'schlofen'],
  },
  {
    id: 'wunnen',
    lb: 'Wunnen',
    en: 'My living space',
    fr: 'Mon logement',
    seeds: ['Haus', 'Wunneng', 'Zëmmer', 'Kichen', 'Gaart', 'wunnen'],
  },
  {
    id: 'transport',
    lb: 'Transport',
    en: 'Transport',
    fr: 'Transports',
    seeds: ['Auto', 'Zuch', 'Bus', 'fueren', 'Vëlo', 'Strooss'],
  },
  {
    id: 'hobbyen',
    lb: 'Hobbyen',
    en: 'Hobbies',
    fr: 'Loisirs',
    seeds: ['Hobby', 'spillen', 'liesen', 'danzen', 'sangen', 'Fräizäit'],
  },
  {
    id: 'stot',
    lb: 'Stot',
    en: 'Household chores',
    fr: 'Tâches ménagères',
    seeds: ['botzen', 'wäschen', 'kachen', 'Kichen', 'raumen', 'akafen'],
  },
  {
    id: 'kreativitéit',
    lb: 'Konschthandwierk',
    en: 'Creativity',
    fr: 'Créativité',
    seeds: ['molen', 'Bild', 'Faarf', 'Musek', 'Theater', 'Foto'],
  },
  {
    id: 'sproochen',
    lb: 'Sproochen',
    en: 'Languages',
    fr: 'Langues',
    seeds: ['Sprooch', 'Lëtzebuergesch', 'léieren', 'schwätzen', 'Wuert', 'verstoen'],
  },
  {
    id: 'liesen',
    lb: 'Liesen',
    en: 'Reading',
    fr: 'Lecture',
    seeds: ['liesen', 'Buch', 'Zeitung', 'Text', 'Bibliothéik', 'schreiwen'],
  },
  {
    id: 'medien',
    lb: 'Medien',
    en: 'Media and technology',
    fr: 'Médias et technologie',
    seeds: ['Internet', 'Computer', 'Telefon', 'Film', 'Radio', 'Noriicht'],
  },
  {
    id: 'joreszäiten',
    lb: 'Joreszäiten',
    en: 'Summer and winter',
    fr: 'Été et hiver',
    seeds: ['Wanter', 'Summer', 'Schnéi', 'kal', 'waarm', 'Wieder'],
  },
  {
    id: 'kaddoen',
    lb: 'Kaddoen',
    en: 'Giving gifts',
    fr: 'Offrir des cadeaux',
    seeds: ['Kaddo', 'schenken', 'Gebuertsdag', 'feieren', 'Fest'],
  },
  {
    id: 'iessen',
    lb: 'Iessen',
    en: 'Food and drink',
    fr: 'Manger et boire',
    seeds: ['Iessen', 'iessen', 'Brout', 'Waasser', 'Kaffi', 'Restaurant'],
  },
  {
    id: 'kleeder',
    lb: 'Kleeder',
    en: 'Clothes',
    fr: 'Vêtements',
    seeds: ['Kleed', 'Schong', 'Hiem', 'Jackett', 'undoen'],
  },
  {
    id: 'feierdeeg',
    lb: 'Feierdeeg',
    en: 'Holidays and celebrations',
    fr: 'Fêtes et jours fériés',
    seeds: ['Feierdag', 'Chrëschtdag', 'feieren', 'Fest', 'Famill'],
  },
  {
    id: 'famill',
    lb: 'Famill',
    en: 'Family and people',
    fr: 'Famille et personnes',
    seeds: ['Famill', 'Kand', 'Frënd', 'Mamm', 'Papp', 'Fra'],
  },
];

module.exports = { TOPICS };
