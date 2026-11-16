import {Native} from '../server/native.js';
const native=new Native();const users=await native.call<any[]>('users');native.close();process.exit(users.some(u=>u.role==='admin')?0:1);
