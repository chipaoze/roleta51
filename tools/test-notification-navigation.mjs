import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('async function openNotificationTarget'),app.indexOf('function renderOnlinePeople'));
let page,focused,toast,refreshed=false;
const details={tagName:'DETAILS',open:false,parentElement:null};
const ids=['feed-comment-c','receivedWallpaperCard','votingPanel','creditLedger','collectionCatalog','mysteryInventoryCard','profileIdentityCard','my-feedback-f','admin-feedback-f'];
const targets=Object.fromEntries(ids.map(id=>[id,{parentElement:details,closest:()=>null,setAttribute(){},focus(){focused=id;},scrollIntoView(){},classList:{add(){},remove(){}}}]));
const context=vm.createContext({appState:{me:{role:'participant'},notifications:{items:[{id:'gift:g',targetId:'collectionCatalog'}]}},portalPages:['memes','sorteio','perfil','admin'],showPortalPage:p=>page=p,showToast:t=>toast=t,document:{getElementById:id=>targets[id]},window:{matchMedia:()=>({matches:true})},setTimeout:fn=>fn(),openFeedbackPanel(){},refreshFeedback:async()=>{refreshed=true;},adminFeedbackFilter:'pending'});
vm.runInContext(source,context);
for(const [id,p,target] of [['mention:c','memes','feed-comment-c'],['assignment:a','sorteio','receivedWallpaperCard'],['vote:v','sorteio','votingPanel'],['credit:a','perfil','creditLedger'],['gift:g','perfil','collectionCatalog'],['feature-master-136','perfil','mysteryInventoryCard'],['forced-cursor:a','perfil','profileIdentityCard'],['feedback:f:date','sorteio','my-feedback-f']]){
 await context.openNotificationTarget(id,p);assert.equal(page,p);assert.equal(focused,target);
}
assert.equal(details.open,true);assert.equal(refreshed,true);
context.appState.me.role='admin';await context.openNotificationTarget('feedback:f:date','sorteio');assert.equal(page,'admin');assert.equal(focused,'admin-feedback-f');assert.equal(context.adminFeedbackFilter,'all');
await context.openNotificationTarget('mention:deleted','memes');assert.match(toast,/não está mais disponível/);
console.log('PASS: comment, wallpaper, vote, credits, gift, chest, cursor, participant/admin feedback, deleted content.');
