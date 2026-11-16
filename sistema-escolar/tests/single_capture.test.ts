import test from 'node:test';
import assert from 'node:assert/strict';
import {payloads} from '../server/schemas.js';
test('Captura única exige modo explícito y supervisión; se conserva contrato de tres gestos',()=>{
 const base={action:'verify',sessionId:1,challengeId:'123e4567-e89b-42d3-a456-426614174000',frames:['frame'],captureMode:'single',supervised:true};
 assert.equal(payloads.mcp_biometrics_tool.parse(base).action,'verify');
 assert.throws(()=>payloads.mcp_biometrics_tool.parse({...base,supervised:false}));
 assert.throws(()=>payloads.mcp_biometrics_tool.parse({...base,frames:['one','two']}));
 const gesture=payloads.mcp_biometrics_tool.parse({...base,captureMode:undefined,frames:['one','two','three']});
 assert.ok(gesture.action==='verify' && gesture.captureMode==='gesture');
});
