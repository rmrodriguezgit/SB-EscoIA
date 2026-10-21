import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),file=resolve(root,'.env');const [key,value]=process.argv.slice(2);if(!/^[A-Z_]+$/.test(key??'')||/[\n\r]/.test(value??''))throw Error('Variable inválida');let s=readFileSync(file,'utf8');const line=`${key}=${value??''}`;const re=new RegExp(`^${key}=.*$`,'m');s=re.test(s)?s.replace(re,()=>line):s+'\n'+line+'\n';writeFileSync(file,s,{mode:0o600});
