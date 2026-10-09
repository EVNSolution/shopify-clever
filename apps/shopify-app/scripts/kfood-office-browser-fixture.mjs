// Synthetic local transport for the actual office components. No operational writes.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const port=43831;
const output=resolve(tmpdir(),'kfood-office-browser-fixture.js');
const entry=`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createBrowserRouter,RouterProvider,useLoaderData} from 'react-router';
import {RouteOptionsDialog,RouteOptionsFields,RouteOptionsEditor,RouteCashPanel,RouteCashSummary} from ${JSON.stringify(resolve(app,'app/features/delivery/route-office-components.jsx'))};
const receipts=[{completion:{id:'receipt1',deliveryStopId:'stop1',currencyCode:'CAD',payment:{methodTitle:'Cash'},expectedAmount:'122.25',actualAmount:'122.00',differenceAmount:'-0.25'},revision:0,settlement:null,history:[]}];
let route={id:'route1',status:'READY',updatedAt:'2026-10-09T00:00:00Z',deliveryProof:{photoRequired:false,signatureRequired:false},tollPolicy:'ALLOW_TOLLS'};
window.fixture={receipts,route,commands:[],failNext:false};
window.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.href);
 if(url.pathname==='/app/routes/route1/cash-settlements')return Response.json({routePlanId:'route1',receipts,errors:[]});
 throw Error('External transport blocked');
};
async function action({request}){
 const form=await request.formData();const body=Object.fromEntries(form);window.fixture.commands.push(body);
 if(window.fixture.failNext){window.fixture.failNext=false;return {errors:[{message:'Connection lost. Retry the same confirmation.'}]};}
 if(new URL(request.url).pathname.endsWith('/options')){
  if(body.expectedUpdatedAt!==route.updatedAt)return {errors:[{code:'CONFLICT',message:'Another office user changed the options. Reload saved options before saving.'}]};
  if(new URLSearchParams(location.search).get('rollout')==='blocked' && (body.photoRequired==='true'||body.signatureRequired==='true'))return {errors:[{code:'DELIVERY_PROOF_ROLLOUT_DISABLED',message:'Required proof is not enabled'}]};
  route={...route,updatedAt:'2026-10-09T00:01:00Z',deliveryProof:{photoRequired:body.photoRequired==='true',signatureRequired:body.signatureRequired==='true'},tollPolicy:body.tollPolicy};window.fixture.route=route;return {routePlan:route,errors:[]};
 }
 const receipt=receipts[0];
 if(Number(body.expectedRevision)!==receipt.revision)return {errors:[{message:'Another office user changed this receipt. Refresh receipts.'}]};
 receipt.revision+=1;receipt.settlement={id:'settlement'+receipt.revision,confirmedAmount:body.confirmedAmount,currency:body.currency,reason:body.reason,actor:'Office QA',recordedAt:'2026-10-09T00:01:00Z'};receipt.history.unshift(receipt.settlement);return {saved:true,receipts,errors:[]};
}
function Page(){const latestRoute=useLoaderData();const[editorOpen,setEditorOpen]=useState(false);const[ordersOptionsOpen,setOrdersOptionsOpen]=useState(false);const[value,setValue]=useState({deliveryProof:{photoRequired:false,signatureRequired:false},tollPolicy:'ALLOW_TOLLS'});return <main style={{fontFamily:'Arial',background:'#f4f5f7',padding:24,maxWidth:1000,margin:'auto',display:'grid',gap:20}}>
<h1>KFood office controls — synthetic preview</h1><section style={{padding:16,background:'white',borderRadius:10}}><h2>Orders · new route</h2><div style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'center'}}><span style={{color:'#616161',fontSize:12}}>Results as of: 2026-10-09, 07:08:54</span><button>Update Shopify orders</button><button aria-haspopup="dialog" style={{marginLeft:'auto'}} onClick={()=>setOrdersOptionsOpen(true)}>Route options</button>{ordersOptionsOpen?<RouteOptionsDialog onClose={()=>setOrdersOptionsOpen(false)}><RouteOptionsFields value={value} onChange={setValue}/></RouteOptionsDialog>:null}</div><div style={{border:'1px solid #d4d4d4',borderRadius:12,padding:12,marginTop:12,maxWidth:300}}>Route plan card — options live outside it</div></section>
<button onClick={()=>{route={...route,updatedAt:"2026-10-09T00:02:00Z",deliveryProof:{photoRequired:false,signatureRequired:true}};router.revalidate();}}>Simulate another office edit</button>
<button aria-haspopup="dialog" onClick={()=>setEditorOpen(true)}>Edit → Route options</button>
{editorOpen?<RouteOptionsEditor routePlan={latestRoute} onClose={()=>setEditorOpen(false)}/>:null}<section style={{padding:16,background:'white',borderRadius:10}}><h2>Routes · Cash / settlement</h2><RouteCashSummary summary={[{currency:'CAD',expectedAmount:'122.25',actualAmount:'122.00',confirmedAmount:null,receiptCount:1,confirmedCount:0},{currency:'USD',expectedAmount:'20.00',actualAmount:'20.00',confirmedAmount:'20.00',receiptCount:1,confirmedCount:1}]}/></section>
<RouteCashPanel routePlanId="route1" stops={[{deliveryStopId:'stop1',order:'#1001'}]}/></main>}
const router=createBrowserRouter([{path:'/',loader:()=>route,element:<Page/>},{path:'/app/routes/:routeId/options',action},{path:'/app/routes/:routeId/cash-settlements',action}]);
createRoot(document.getElementById('root')).render(<RouterProvider router={router}/>);
`;
await build({stdin:{contents:entry,loader:'jsx',resolveDir:app},bundle:true,jsx:'automatic',format:'esm',platform:'browser',outfile:output,plugins:[{name:'app-bridge-fixture',setup(builder){builder.onResolve({filter:/^@shopify\/app-bridge-react$/},()=>({path:'bridge',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'const bridge={idToken:async()=>"synthetic-token"}; export const useAppBridge=()=>bridge;'}));}}]});
createServer(async(req,res)=>{
 if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(output));return;}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"/><title>KFood office preview</title></head><body style="margin:0"><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>');
}).listen(port,'127.0.0.1',()=>process.stdout.write('http://127.0.0.1:'+port+'\n'));
