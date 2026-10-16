import {chromium} from 'file:///C:/Users/shiva/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try{
  for(const [name,bbox] of [['close-up','77.60,12.965,77.605,12.97'],['city','77.47590248086419,12.817922298552277,77.73835872490554,13.153546086110113']]){
    const page=await browser.newPage({viewport:{width:1280,height:800}}),requests=[],responses=[];
    const started=Date.now();
    page.on('request',r=>{if(r.url().includes('/api/v1/map/')){requests.push({url:r.url(),ms:Date.now()-started});console.log(name,'request',Date.now()-started,r.url().includes('/summary')?'summary':'roads')}});
    page.on('response',r=>{if(r.url().includes('/api/v1/map/')){responses.push({url:r.url(),ms:Date.now()-started,status:r.status()});console.log(name,'response',r.status(),Date.now()-started)}});
    await page.goto(`https://theroadproblem.quest/?bbox=${bbox}`);
    try{
      await page.waitForFunction(()=>{
        const main=document.querySelector('main');if(!main||!main.querySelector('canvas'))return false;
        const text=main.textContent;
        return !['Loading roads in this area','Area totals will update after roads load.','Updating this map area'].some(s=>text.includes(s));
      },null,{timeout:120000});
      const text=await page.locator('main').innerText();
      fs.writeFileSync(`output/map-load/${name}-final.txt`,text);
      assert.ok(!/could not.*load|could not be loaded|Retry area summary/i.test(text),text);
      assert.ok(text.includes('Motor-road length in view'),'Area summary must be rendered');
      assert.ok(responses.length>=2);
      for(const response of responses)assert.equal(response.status,200,JSON.stringify(response));
      const roadResponses=responses.filter(r=>r.url.includes('/deck?'));
      const summaries=requests.filter(r=>r.url.includes('/summary?'));
      assert.equal(summaries.length,1,'Initial viewport should trigger one area summary');
      assert.ok(summaries[0].ms>=Math.max(...roadResponses.map(r=>r.ms)),'Summary must begin after road pages finish');
      assert.equal(requests.filter(r=>r.url.includes('/deck?')&&!r.url.includes('cursor=')).length,1,'No premature initial city query');
      const screenshot=`output/playwright/map-loading-${name}-final.png`;
      await page.screenshot({path:screenshot});
      results.push({name,ms:Date.now()-started,screenshot,requests,responses});
      console.log(name,'browser verification passed',Date.now()-started);
    }catch(error){await page.screenshot({path:`output/playwright/map-loading-${name}-failure.png`});throw error;}
    finally{await page.close()}
  }
  fs.writeFileSync('output/map-load/browser-verification.json',JSON.stringify({passed:true,checked_at:new Date().toISOString(),results},null,2));
  console.log('Deployed browser verification passed');
}finally{await browser.close()}
