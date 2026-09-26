import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://localhost:5173/signin-with-chatgpt?return_to=/');
 await page.getByRole('heading',{name:'Lead workspace',exact:true}).waitFor();
 await page.waitForResponse(r=>r.url().endsWith('/api/workspace')&&r.status()===200);
 await page.getByRole('button',{name:'Filter Total leads',exact:true}).click();
 await page.getByRole('button',{name:'Filter Interested leads',exact:true}).click();
 await page.getByText('Interested leads — click Reset to view all.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Reset',exact:true}).click();
 fs.mkdirSync('work/qa',{recursive:true});
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:1000});
  await page.screenshot({path:`work/qa/leads-${width}.png`,fullPage:true});
  const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,wrap:getComputedStyle(document.querySelector('.filter-bar')).flexWrap}));
  assert.ok(layout.scroll<=layout.width+1,`Body overflow at ${width}: ${JSON.stringify(layout)}`);assert.equal(layout.wrap,'nowrap');
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 for(const tab of ['General','Integrations','Users & roles','Audit history']){await page.getByRole('tab',{name:tab,exact:true}).click();await page.getByRole('tabpanel').waitFor();}
 await page.screenshot({path:'work/qa/audit-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'work/qa/settings-mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Settings mobile overflow');
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:'Leads',exact:true}).click();
 await page.getByRole('button',{name:'Generate leads',exact:true}).click();
 assert.ok(await page.getByRole('button',{name:'Create search job',exact:true}).isDisabled(),'Missing credentials disables generation');
 await page.screenshot({path:'work/qa/provider-dialog.png',fullPage:true});
 assert.deepEqual(errors,[],'Browser runtime errors');
 console.log('PASS: desktop/tablet/mobile/320px layouts; single-row filters; clickable stats; Settings tabs and audit; credentials gate. No browser runtime errors.');
}catch(e){fs.mkdirSync('work/qa',{recursive:true});await page.screenshot({path:'work/qa/failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(0,4000));console.error(errors);throw e;}finally{await browser.close();}
