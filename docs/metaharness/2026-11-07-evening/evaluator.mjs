import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const [base,candidate,tools,output]=process.argv.slice(2).map(x=>resolve(x));
const fw=await import(pathToFileURL(`${tools}/node_modules/@metaharness/flywheel/dist/index.js`));
assert.equal(JSON.parse(readFileSync(`${tools}/node_modules/@metaharness/flywheel/package.json`)).version,'0.1.12');
const path='src/auth/rbac.ts',hash=b=>createHash('sha256').update(b).digest('hex');
const bytes=r=>readFileSync(`${r}/${path}`),parentHash=hash(bytes(base)),candidateHash=hash(bytes(candidate));
function measure(root){
 const run=spawnSync(process.execPath,[new URL('./probe-owner.cjs',import.meta.url).pathname,root],{encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH}});
 assert.equal(run.status,0,run.stderr);return JSON.parse(run.stdout);
}
const trials=[];for(let i=0;i<5;i++)for(const root of i%2?[candidate,base]:[base,candidate])trials.push({trial:i,root,report:measure(root)});
const measurements=[],fingerprint=fw.gateFingerprint(fw.meetsPromotionRule);
const result=await fw.runFlywheelGenerations({rootPolicy:{revision:parentHash},
 proposer:async()=>({value:candidateHash,summary:'Reject malformed scoped resource owners before same-tenant admin allowance',inverse:{path,parentBytes:bytes(base).toString(),parentSha256:parentHash}}),
 evaluator:async(policy,suite)=>{const root=policy.revision===parentHash?base:candidate;assert.equal(hash(bytes(root)),policy.revision);const report=measure(root),items=suite.id==='holdout'?report.holdout:report.anchors,wins=items.map(x=>x.passed);const score={primary:wins.filter(Boolean).length/wins.length,itemWins:wins,noopRate:0,costPerWin:0,regressed:true};measurements.push({revision:policy.revision,suite:suite.id,report,score});return score;},
 holdout:{id:'holdout',items:[1,2,3,4,5,6,7,8]},anchor:{id:'anchor',items:[1,2,3,4,5,6,7,8]},promotionRule:fw.meetsPromotionRule,maxGenerations:1,signer:fw.makeSigner(),dataSource:'LIVE_COMPILED_PRODUCTION_RBAC'
});
const replay=fw.verifyReplayBundle(result.replayBundle,{pinnedGateFingerprint:fingerprint});assert.equal(replay.pass,true);assert.equal(result.promotions.length,0);
const evidence={parentHash,candidateHash,trials,measurements,promotions:result.promotions.length,fingerprint,replay,replayBundle:result.replayBundle,inverse:{path,parentBytes:bytes(base).toString(),parentSha256:parentHash},contract:JSON.parse(readFileSync(new URL('../../docs/metaharness/2026-11-07-evening/contract.json',import.meta.url))),probeSha256:hash(readFileSync(new URL('./probe-owner.cjs',import.meta.url))),boundary:'regressed=true is the fail-closed full-repository veto, not a newly measured component regression. Zero cost/noop neutral and unmeasured. Root-only replay is not candidate promotion proof. Source rollback never erases append-only memory.'};
writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({trials:trials.map(x=>({trial:x.trial,root:x.root,holdout:x.report.holdout.filter(y=>y.passed).length,anchors:x.report.anchors.filter(y=>y.passed).length})),promotions:0,replay}));
