import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
const path='lib/problem-bank-data.json',index=JSON.parse(fs.readFileSync(path,'utf8'));
for(const p of index){const packed=fs.readFileSync(`public/bank-assets/${p.asset}.bin`),dec=crypto.createDecipheriv('aes-256-gcm',Buffer.from(p.key,'base64'),packed.subarray(0,12));dec.setAuthTag(packed.subarray(-16));const detail=JSON.parse(zlib.gunzipSync(Buffer.concat([dec.update(packed.subarray(12,-16)),dec.final()])));p.imageHash=crypto.createHash('sha256').update(Buffer.from(detail.image,'base64')).digest('hex');}
fs.writeFileSync(path,JSON.stringify(index));console.log(`Indexed ${index.length} bank image fingerprints`);
