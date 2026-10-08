import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

export function ensureBucket(bucket,run) {
 const listing=run(['r2','bucket','list']);
 const names=[...listing.replace(/\u001b\[[0-9;]*m/g,'').matchAll(/^\s*name:\s*(\S+)\s*$/gm)].map(m=>m[1]);
 if(names.includes(bucket))return 'existing';
 run(['r2','bucket','create',bucket]);
 return 'created';
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const config=JSON.parse(readFileSync(new URL('../../wrangler.jsonc',import.meta.url),'utf8'));
 const bucket=config.r2_buckets.find(b=>b.binding==='BUCKET').bucket_name;
 if(!bucket)throw new Error('BUCKET requires an explicit bucket_name.');
 const cli=createRequire(import.meta.url).resolve('wrangler/bin/wrangler.js');
 const run=args=>execFileSync(process.execPath,[cli,...args,'--config','../wrangler.jsonc'],{
  encoding:'utf8',env:{...process.env,CI:'true',NO_COLOR:'1',CLOUDFLARE_ACCOUNT_ID:config.account_id},
  stdio:['ignore','pipe','inherit'],
 });
 console.log(`Attachment bucket ${bucket}: ${ensureBucket(bucket,run)}.`);
}
