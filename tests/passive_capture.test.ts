import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmFaceMatches} from '../server/face_consensus.js';
import {payloads} from '../server/schemas.js';
test('Modo pasivo requiere supervisión y admite tres capturas sin gestos',()=>{
 const p={action:'verify',sessionId:1,challengeId:'123e4567-e89b-42d3-a456-426614174000',frames:['a','b','c'],captureMode:'passive',supervised:true};
 assert.equal(payloads.mcp_biometrics_tool.parse(p).action,'verify');
 assert.throws(()=>payloads.mcp_biometrics_tool.parse({...p,supervised:false}));
});
test('Consenso temporal rechaza identidades mezcladas, ambigüedad y métricas inválidas',()=>{
 const strong={studentId:7,score:.8,margin:.2};
 assert.equal(confirmFaceMatches([strong,strong,strong],.55,.08,3).studentId,7);
 for(const weak of [{...strong,studentId:8},{...strong,score:.54},{...strong,margin:.07},{...strong,score:NaN},{...strong,studentId:0}])
  assert.throws(()=>confirmFaceMatches([strong,strong,weak],.55,.08,3));
 assert.throws(()=>confirmFaceMatches([strong],.55,.08,3));
});
