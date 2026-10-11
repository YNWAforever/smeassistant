"use client"
import {useRef,useState} from 'react';
import type {AssetItem} from '@/lib/workspace/assets';
import type {PrototypeLocale} from '@/lib/copy';
import {fetchJsonWithinDeadline} from '@/lib/scanner/bounded-request';
export function AssetPreview({asset,workspaceId,locale}:{asset:Pick<AssetItem,'id'|'kind'|'storage_path'|'filename'|'alt_text'|'signedUrl'>;workspaceId:string;locale:PrototypeLocale}){
 const [url,setUrl]=useState(asset.signedUrl),[failed,setFailed]=useState(false);
 const attempted=useRef(false);
 const endpoint=`/api/workspaces/${encodeURIComponent(workspaceId)}/assets/${encodeURIComponent(asset.id)}/preview`;
 const pdf=asset.storage_path.toLowerCase().endsWith('.pdf');
 async function renew(){
  if(attempted.current){setFailed(true);return;}attempted.current=true;
  try{const {response,data:result}=await fetchJsonWithinDeadline(endpoint,{cache:'no-store'},10_000);if(!response.ok)throw new Error();
   if(typeof result.url!=='string')throw new Error();setUrl(result.url);setFailed(false);
  }catch{setFailed(true);}
 }
 if(pdf || asset.kind==='document')return <a href={`${endpoint}?open=1`} target='_blank' rel='noreferrer'>{locale==='en'?'Open document':locale==='zh-TW'?'開啟文件':'開啟文件'}</a>;
 return <>{url && <img src={url} alt={asset.alt_text ?? asset.filename} loading='lazy' onError={()=>void renew()}/>}{(failed || !url) && <button type='button' onClick={()=>{attempted.current=false;void renew();}}>{locale==='en'?'Reload preview':'重新載入預覽'}</button>}</>;
}
