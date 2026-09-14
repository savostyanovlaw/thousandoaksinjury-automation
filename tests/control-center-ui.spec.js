const { test, expect } = require('@playwright/test');

const state = {
  generatedAt: '2026-09-13T20:00:00Z', stale: false, writeActionsAvailable: true,
  githubDiagnostics: {configured:true,authStatus:200,repoStatus:200,workflowStatus:403},
  summary: { healthy: 1, running: 0, needsAttention: 0, waitingApproval: 0, notDeployed: 9, disabled: 0 },
  approvals: [], attention: [],
  activity: [{agentId:'technical-seo-watchdog',title:'Technical SEO Watchdog last run',timestamp:'2026-09-13T20:00:00Z',status:'success'}],
  agents: [
    {id:'technical-seo-watchdog',name:'Technical SEO Watchdog',description:'Monitors production technical SEO and contact integrity.',status:'HEALTHY',stale:false,lastRun:{createdAt:'2026-09-13T20:00:00Z',conclusion:'success'},issues:[],pulls:[],pendingApprovals:0,capabilities:[{name:'RUN_NOW',autonomy:'GREEN'}],cadenceHours:12},
    ...['Opportunity Finder','Local SEO Robot','Content Creator','Video Engine','CTR Optimizer','Internal Link Builder','Russian-Language Robot','Content Refresher','Competitor Monitor'].map((name,i)=>({id:`future-${i}`,name,description:'Future agent',status:'NOT DEPLOYED',stale:false,lastRun:null,issues:[],pulls:[],pendingApprovals:0,capabilities:[]}))
  ]
};

async function mockApi(page,overrideState=state){
  await page.route('**/api/control/state', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(overrideState)}));
  await page.route('**/api/control/agents/**', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({agent:overrideState.agents[0],activity:overrideState.activity,attention:[],approvals:[]})}));
  await page.route('**/api/control/commands', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result:{ok:true}})}));
}

test('desktop cockpit renders ten agents and safe command', async ({ page }) => {
  await mockApi(page); await page.goto('http://127.0.0.1:4173/');
  await expect(page.getByRole('heading',{name:'AI Control Center'})).toBeVisible();
  await expect(page.locator('.agent-card')).toHaveCount(10);
  await expect(page.getByRole('button',{name:'RUN NOW'})).toBeVisible();
  await expect(page.getByRole('button',{name:'RUN NOW'})).toBeEnabled();
  await expect(page.getByText('NOT DEPLOYED',{exact:true})).toHaveCount(9);
  await expect(page.locator('body')).not.toContainText(/GITHUB_TOKEN|ACCESS_AUD|PRIVATE KEY/);
});

test('cockpit shows safe GitHub diagnostics inline', async ({ page }) => {
  await mockApi(page); await page.goto('http://127.0.0.1:4173/');
  await expect(page.getByText('GitHub auth 200 · repo 200 · workflow 403')).toBeVisible();
});

test('cockpit shows GitHub error message without exposing credentials', async ({ page }) => {
  const badCreds={...state,githubDiagnostics:{configured:true,authStatus:403,repoStatus:403,workflowStatus:403,authMessage:'Bad credentials'}};
  await mockApi(page,badCreds); await page.goto('http://127.0.0.1:4173/');
  await expect(page.getByText('GitHub auth 403 · repo 403 · workflow 403 · Bad credentials')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/Bearer never|GITHUB_TOKEN/);
});

test('mobile cockpit remains usable', async ({ page }) => {
  await page.setViewportSize({width:390,height:844}); await mockApi(page); await page.goto('http://127.0.0.1:4173/');
  await expect(page.locator('.agent-card')).toHaveCount(10);
  await expect(page.getByRole('button',{name:'RUN NOW'})).toBeVisible();
});

test('safe command can be dispatched from Watchdog card', async ({ page }) => {
  await mockApi(page); let body;
  await page.route('**/api/control/commands', async r=>{body=JSON.parse(r.request().postData()); await r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});});
  await page.goto('http://127.0.0.1:4173/'); await page.getByRole('button',{name:'RUN NOW'}).click();
  await expect.poll(()=>body?.agentId).toBe('technical-seo-watchdog'); expect(body.command).toBe('RUN_NOW'); expect(body.workflow).toBeUndefined();
});

test('safe command is disabled when GitHub write actions are unavailable', async ({ page }) => {
  const noWrite={...state,writeActionsAvailable:false};
  await mockApi(page,noWrite); await page.goto('http://127.0.0.1:4173/');
  const button=page.getByRole('button',{name:'RUN NOW'});
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('title','GitHub write actions are not configured');
});
