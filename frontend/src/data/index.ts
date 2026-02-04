// ========================================
// STARGUIDE - Character Database
// ========================================
// All 79 playable characters

import type { Character } from '../types';

// Import character files (alphabetical order)
import { acheron } from './characters/acheron';
import { aglaea } from './characters/aglaea';
import { anaxa } from './characters/anaxa';
import { archer } from './characters/archer';
import { argenti } from './characters/argenti';
import { arlan } from './characters/arlan';
import { asta } from './characters/asta';
import { aventurine } from './characters/aventurine';
import { bailu } from './characters/bailu';
import { blackSwan } from './characters/black-swan';
import { blade } from './characters/blade';
import { boothill } from './characters/boothill';
import { bronya } from './characters/bronya';
import { castorice } from './characters/castorice';
import { cerydra } from './characters/cerydra';
import { cipher } from './characters/cipher';
import { clara } from './characters/clara';
import { cyrene } from './characters/cyrene';
import { danHeng } from './characters/dan-heng';
import { danHengPermensorTerrae } from './characters/dan-heng-permansor-terrae';
import { drRatio } from './characters/dr-ratio';
import { feixiao } from './characters/feixiao';
import { firefly } from './characters/firefly';
import { fuXuan } from './characters/fu-xuan';
import { gallagher } from './characters/gallagher';
import { gepard } from './characters/gepard';
import { guinaifen } from './characters/guinaifen';
import { hanya } from './characters/hanya';
import { herta } from './characters/herta';
import { himeko } from './characters/himeko';
import { hook } from './characters/hook';
import { huohuo } from './characters/huohuo';
import { hyacine } from './characters/hyacine';
import { hysilens } from './characters/hysilens';
import { imbibitorLunae } from './characters/imbibitor-lunae';
import { jade } from './characters/jade';
import { jiaoqiu } from './characters/jiaoqiu';
import { jingYuan } from './characters/jing-yuan';
import { jingliu } from './characters/jingliu';
import { kafka } from './characters/kafka';
import { lingsha } from './characters/lingsha';
import { luka } from './characters/luka';
import { luocha } from './characters/luocha';
import { lynx } from './characters/lynx';
import { marchSevenTh } from './characters/march-7th';
import { marchSevenThEvernight } from './characters/march-7th-evernight';
import { marchSeventhSwordmaster } from './characters/march-7th-swordmaster';
import { misha } from './characters/misha';
import { moze } from './characters/moze';
import { mydei } from './characters/mydei';
import { natasha } from './characters/natasha';
import { pela } from './characters/pela';
import { phainon } from './characters/phainon';
import { qingque } from './characters/qingque';
import { rappa } from './characters/rappa';
import { robin } from './characters/robin';
import { ruanMei } from './characters/ruan-mei';
import { saber } from './characters/saber';
import { sampo } from './characters/sampo';
import { seele } from './characters/seele';
import { serval } from './characters/serval';
import { silverWolf } from './characters/silver-wolf';
import { sparkle } from './characters/sparkle';
import { sunday } from './characters/sunday';
import { sushang } from './characters/sushang';
import { theDahlia } from './characters/the-dahlia';
import { theHerta } from './characters/the-herta';
import { tingyun } from './characters/tingyun';
import { tingyunFugue } from './characters/tingyun-fugue';
import { topaz } from './characters/topaz';
import { trailblazerDestruction } from './characters/trailblazer-destruction';
import { trailblazerHarmony } from './characters/trailblazer-harmony';
import { trailblazerPreservation } from './characters/trailblazer-preservation';
import { trailblazerRemembrance } from './characters/trailblazer-remembrance';
import { tribbie } from './characters/tribbie';
import { welt } from './characters/welt';
import { xueyi } from './characters/xueyi';
import { yanqing } from './characters/yanqing';
import { yukong } from './characters/yukong';
import { yunli } from './characters/yunli';

// Import and initialize helpers
import { setCharactersRef } from './helpers';

// Combine all characters into a single array
export const characters: Character[] = [
  acheron,
  aglaea,
  anaxa,
  archer,
  argenti,
  arlan,
  asta,
  aventurine,
  bailu,
  blackSwan,
  blade,
  boothill,
  bronya,
  castorice,
  cerydra,
  cipher,
  clara,
  cyrene,
  danHeng,
  danHengPermensorTerrae,
  drRatio,
  feixiao,
  firefly,
  fuXuan,
  gallagher,
  gepard,
  guinaifen,
  hanya,
  herta,
  himeko,
  hook,
  huohuo,
  hyacine,
  hysilens,
  imbibitorLunae,
  jade,
  jiaoqiu,
  jingYuan,
  jingliu,
  kafka,
  lingsha,
  luka,
  luocha,
  lynx,
  marchSevenTh,
  marchSevenThEvernight,
  marchSeventhSwordmaster,
  misha,
  moze,
  mydei,
  natasha,
  pela,
  phainon,
  qingque,
  rappa,
  robin,
  ruanMei,
  saber,
  sampo,
  seele,
  serval,
  silverWolf,
  sparkle,
  sunday,
  sushang,
  theDahlia,
  theHerta,
  tingyun,
  tingyunFugue,
  topaz,
  trailblazerDestruction,
  trailblazerHarmony,
  trailblazerPreservation,
  trailblazerRemembrance,
  tribbie,
  welt,
  xueyi,
  yanqing,
  yukong,
  yunli,
];

// Initialize the helpers with the characters reference
setCharactersRef(characters);

// Re-export all helper functions
export {
  getCharacterById,
  getCharactersByTier,
  getCharactersByElement,
  getCharactersByPath,
  getCharactersByRole,
  getCharactersByRarity,
  searchCharacters,
} from './helpers';
