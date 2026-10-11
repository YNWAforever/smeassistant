import {DISTRICTS_HK,DISTRICTS_TW,INDUSTRIES_HK,INDUSTRIES_TW} from '@sme-scanner/region';
import type {PrototypeLocale} from '@/lib/copy';

/** Stable code / historical label lookup; merchant text and unknown values are never guessed. */
export function reportTaxonomyLabel(value:string|null|undefined,kind:'district'|'industry',market:string,locale:PrototypeLocale):string|null {
  if(!value)return null;
  if(kind==='industry'){
    const row=(market==='tw'?INDUSTRIES_TW:INDUSTRIES_HK).find(row=>[row.value,row.label,row.labelEn].includes(value));
    return row?(locale==='en'?row.labelEn:row.label):value;
  }
  const rows=market==='tw'?DISTRICTS_TW:DISTRICTS_HK;
  const row=rows.find(row=>[row.zh,row.en,row.en.toLowerCase().replace(/[^a-z0-9]+/g,'-'),`${row.en} District`].includes(value));
  return row?(locale==='en'?market==='hk'?`${row.en} District`:row.en:row.zh):value;
}
