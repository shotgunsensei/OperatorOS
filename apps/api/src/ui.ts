import type { FastifyInstance } from 'fastify';

function html(title: string, body: string, scripts = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | OperatorOS</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0a;color:#e0e0e0;line-height:1.5}
a{color:#60a5fa;text-decoration:none}a:hover{text-decoration:underline}
.header{height:48px;display:flex;align-items:center;padding:0 20px;border-bottom:1px solid #222;background:#111;justify-content:space-between}
.header h1{font-size:15px;font-weight:700;letter-spacing:-.02em;color:#fff}
.header .tagline{font-size:11px;color:#666;font-weight:400}
.container{max-width:1100px;margin:0 auto;padding:20px}
.card{background:#161616;border:1px solid #222;border-radius:8px;padding:16px;margin-bottom:12px}
.card h3{font-size:14px;margin-bottom:8px;color:#fff}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase}
.badge-running{background:#064e3b;color:#34d399}
.badge-pending{background:#3b3610;color:#fbbf24}
.badge-stopped{background:#451a1a;color:#f87171}
.badge-error{background:#451a1a;color:#f87171}
.badge-succeeded{background:#064e3b;color:#34d399}
.badge-failed{background:#451a1a;color:#f87171}
.badge-provisioning{background:#1e3a5f;color:#60a5fa}
.btn{display:inline-block;padding:6px 14px;border:1px solid #333;border-radius:6px;font-size:12px;cursor:pointer;background:#1a1a1a;color:#e0e0e0;font-family:inherit}
.btn:hover{background:#252525;border-color:#444}
.btn-primary{background:#2563eb;border-color:#2563eb;color:#fff}.btn-primary:hover{background:#1d4ed8}
.btn-danger{background:#991b1b;border-color:#991b1b;color:#fff}.btn-danger:hover{background:#7f1d1d}
.btn-sm{padding:4px 10px;font-size:11px}
input,textarea,select{background:#111;border:1px solid #333;color:#e0e0e0;padding:8px 10px;border-radius:6px;font-size:13px;font-family:inherit;width:100%}
input:focus,textarea:focus,select:focus{outline:none;border-color:#2563eb}
label{font-size:12px;font-weight:500;display:block;margin-bottom:4px;color:#999}
.form-row{margin-bottom:12px}
.terminal{background:#000;border:1px solid #222;border-radius:6px;padding:12px;font-family:'Cascadia Code','Fira Code',monospace;font-size:12px;max-height:400px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;color:#a3e635}
.terminal .stderr{color:#f87171}
.terminal .exit{color:#60a5fa}
.terminal .info{color:#888}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.mono{font-family:'Cascadia Code','Fira Code',monospace;font-size:12px}
.mt-2{margin-top:8px}.mt-4{margin-top:16px}
.flex{display:flex;gap:8px;align-items:center}
.text-sm{font-size:12px;color:#888}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:8px;border-bottom:1px solid #333;color:#888;font-weight:500;font-size:11px;text-transform:uppercase}
td{padding:8px;border-bottom:1px solid #1a1a1a}
.nav{display:flex;gap:16px;padding:0 20px;background:#111;border-bottom:1px solid #222;height:36px;align-items:center}
.nav a{font-size:12px;color:#888;font-weight:500}.nav a:hover,.nav a.active{color:#fff;text-decoration:none}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid #333;border-top-color:#60a5fa;border-radius:50%;animation:spin .6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="header">
  <div class="flex">
    <h1>OperatorOS</h1>
    <span class="tagline">Powered by Shotgun Ninjas</span>
  </div>
</div>
<div class="nav">
  <a href="/ui" data-testid="nav-workspaces">Workspaces</a>
  <a href="/ui/tasks" data-testid="nav-tasks">Tasks</a>
  <a href="/ui/profiles" data-testid="nav-profiles">Profiles</a>
</div>
${body}
${scripts}
</body>
</html>`;
}

export function serveUI(app: FastifyInstance) {

  app.get('/ui', async (_req, reply) => {
    reply.type('text/html').send(html('Workspaces', `
<div class="container">
  <div class="flex" style="justify-content:space-between;margin-bottom:16px">
    <h2 style="font-size:18px;color:#fff" data-testid="text-workspaces-title">Workspaces</h2>
    <button class="btn btn-primary" onclick="document.getElementById('create-form').style.display='block'" data-testid="button-create-workspace">+ New Workspace</button>
  </div>

  <div id="create-form" class="card" style="display:none">
    <h3>Create Workspace</h3>
    <form onsubmit="createWorkspace(event)">
      <div class="grid-2">
        <div class="form-row">
          <label>Git URL</label>
          <input id="git-url" placeholder="https://github.com/user/repo" required data-testid="input-git-url" />
        </div>
        <div class="form-row">
          <label>Git Ref</label>
          <input id="git-ref" value="main" data-testid="input-git-ref" />
        </div>
      </div>
      <div class="form-row">
        <label>Profile</label>
        <select id="profile-id" data-testid="select-profile"></select>
      </div>
      <div class="flex mt-2">
        <button type="submit" class="btn btn-primary" data-testid="button-submit-workspace">Create</button>
        <button type="button" class="btn" onclick="document.getElementById('create-form').style.display='none'" data-testid="button-cancel">Cancel</button>
      </div>
    </form>
  </div>

  <div id="workspace-list" data-testid="workspace-list"><div class="text-sm">Loading...</div></div>
</div>`, `<script>
async function loadProfiles(){
  const r=await fetch('/v1/profiles');const d=await r.json();
  const sel=document.getElementById('profile-id');
  d.profiles.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name+' ('+p.image+')';sel.appendChild(o)});
}
async function loadWorkspaces(){
  const r=await fetch('/v1/workspaces');const d=await r.json();
  const el=document.getElementById('workspace-list');
  if(!d.workspaces.length){el.innerHTML='<div class="text-sm">No workspaces yet.</div>';return}
  el.innerHTML='<table><thead><tr><th>ID</th><th>Repository</th><th>Profile</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>'+
    d.workspaces.map(w=>'<tr data-testid="row-workspace-'+w.id+'"><td class="mono" style="font-size:11px">'+w.id.slice(0,8)+'</td><td>'+w.gitUrl+'<span class="text-sm"> @ '+w.gitRef+'</span></td><td>'+w.profileId+'</td><td><span class="badge badge-'+w.status+'">'+w.status+'</span></td><td class="text-sm">'+new Date(w.createdAt).toLocaleString()+'</td><td><a href="/ui/workspace/'+w.id+'" class="btn btn-sm" data-testid="link-workspace-'+w.id+'">Open</a></td></tr>').join('')+
    '</tbody></table>';
}
async function createWorkspace(e){
  e.preventDefault();
  const body={gitUrl:document.getElementById('git-url').value,gitRef:document.getElementById('git-ref').value,profileId:document.getElementById('profile-id').value};
  await fetch('/v1/workspaces',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  document.getElementById('create-form').style.display='none';
  loadWorkspaces();
}
loadProfiles();loadWorkspaces();
</script>`));
  });

  app.get('/ui/workspace/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    reply.type('text/html').send(html('Workspace', `
<div class="container">
  <div id="ws-info" data-testid="workspace-detail"><div class="spinner"></div> Loading workspace...</div>
  <div class="grid-2 mt-4">
    <div>
      <div class="card">
        <h3>Actions</h3>
        <div class="flex mt-2" style="flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="startRunner()" data-testid="button-start">Start Runner</button>
          <button class="btn btn-danger btn-sm" onclick="stopRunner()" data-testid="button-stop">Stop Runner</button>
          <button class="btn btn-sm" onclick="verify()" data-testid="button-verify">Verify</button>
          <button class="btn btn-sm" onclick="gitStatus()" data-testid="button-git-status">Git Status</button>
          <button class="btn btn-sm" onclick="createTask()" data-testid="button-create-task">Create Task</button>
        </div>
      </div>
      <div class="card mt-2">
        <h3>Run Command</h3>
        <div class="form-row">
          <input id="cmd-input" placeholder="node -v" data-testid="input-command" />
        </div>
        <button class="btn btn-sm" onclick="execCmd()" data-testid="button-exec">Execute</button>
      </div>
      <div class="card mt-2">
        <h3>Apply Patch (unified diff)</h3>
        <div class="form-row">
          <textarea id="patch-input" rows="6" placeholder="Paste unified diff here..." data-testid="input-patch" style="font-family:monospace;font-size:11px"></textarea>
        </div>
        <button class="btn btn-sm" onclick="applyPatch()" data-testid="button-apply-patch">Apply</button>
      </div>
      <div class="card mt-2">
        <h3>Git Operations</h3>
        <div class="form-row">
          <label>Branch name</label>
          <input id="branch-name" placeholder="feature/my-branch" data-testid="input-branch" />
        </div>
        <button class="btn btn-sm" onclick="createBranch()" data-testid="button-create-branch">Create Branch</button>
        <div class="form-row mt-2">
          <label>Commit message</label>
          <input id="commit-msg" placeholder="feat: add feature" data-testid="input-commit-msg" />
        </div>
        <button class="btn btn-sm" onclick="commitChanges()" data-testid="button-commit">Commit</button>
      </div>
      <div id="verify-results" class="mt-2" data-testid="verify-results"></div>
    </div>
    <div>
      <div class="card">
        <h3>Terminal <span id="ws-indicator" class="text-sm"></span></h3>
        <div id="terminal" class="terminal" data-testid="terminal">Connecting...\n</div>
      </div>
      <div id="tasks-section" class="card mt-2">
        <h3>Tasks</h3>
        <div id="task-list" data-testid="task-list">Loading...</div>
      </div>
    </div>
  </div>
</div>`, `<script>
const WS_ID='${id}';
const term=document.getElementById('terminal');
function appendTerm(text,cls){const s=document.createElement('span');if(cls)s.className=cls;s.textContent=text+'\\n';term.appendChild(s);term.scrollTop=term.scrollHeight}

let ws;
function connectWS(){
  const proto=location.protocol==='https:'?'wss:':'ws:';
  const gwPort=location.port;
  try{
    ws=new WebSocket(proto+'//'+location.hostname+':'+gwPort+'/v1/runner/stream/'+WS_ID);
    ws.onopen=()=>{document.getElementById('ws-indicator').textContent='(connected)';appendTerm('[ws] connected','info')};
    ws.onmessage=(e)=>{
      const msg=JSON.parse(e.data);
      if(msg.type==='stream:stdout')appendTerm(msg.payload.message,'');
      else if(msg.type==='stream:stderr')appendTerm(msg.payload.message,'stderr');
      else if(msg.type==='stream:exit')appendTerm('[exit '+msg.payload.exitCode+'] '+msg.payload.durationMs+'ms','exit');
      else appendTerm('['+msg.type+'] '+(msg.payload.message||JSON.stringify(msg.payload)),'info');
    };
    ws.onclose=()=>{document.getElementById('ws-indicator').textContent='(disconnected)';setTimeout(connectWS,3000)};
  }catch(e){appendTerm('[ws] failed to connect','stderr')}
}

async function loadWS(){
  const r=await fetch('/v1/workspaces/'+WS_ID);const d=await r.json();
  document.getElementById('ws-info').innerHTML=
    '<div class="flex" style="justify-content:space-between"><div><h2 style="font-size:18px;color:#fff">'+d.gitUrl+'</h2>'+
    '<div class="text-sm">Ref: '+d.gitRef+' &middot; Profile: '+d.profileId+' &middot; ID: '+d.id+'</div></div>'+
    '<span class="badge badge-'+d.status+'" data-testid="status-workspace">'+d.status+'</span></div>';
}

async function startRunner(){
  appendTerm('[action] Starting runner...','info');
  const r=await fetch('/v1/workspaces/'+WS_ID+'/start',{method:'POST'});const d=await r.json();
  appendTerm('[start] '+(d.message||JSON.stringify(d)),d.success?'info':'stderr');
  loadWS();
}
async function stopRunner(){
  const r=await fetch('/v1/workspaces/'+WS_ID+'/stop',{method:'POST'});const d=await r.json();
  appendTerm('[stop] '+(d.message||JSON.stringify(d)),'info');loadWS();
}
async function execCmd(){
  const cmd=document.getElementById('cmd-input').value;if(!cmd)return;
  appendTerm('$ '+cmd,'info');
  const r=await fetch('/v1/workspaces/'+WS_ID+'/exec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cmd})});
  const d=await r.json();
  if(d.stdout)appendTerm(d.stdout);if(d.stderr)appendTerm(d.stderr,'stderr');
  appendTerm('[exit '+d.exitCode+'] '+d.durationMs+'ms','exit');
}
async function gitStatus(){
  const r=await fetch('/v1/workspaces/'+WS_ID+'/git-status',{method:'POST'});const d=await r.json();
  appendTerm('$ git status --porcelain','info');appendTerm(d.status||'(clean)');
}
async function applyPatch(){
  const diff=document.getElementById('patch-input').value;if(!diff)return;
  appendTerm('[patch] Applying...','info');
  const r=await fetch('/v1/workspaces/'+WS_ID+'/apply-patch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({diff})});
  const d=await r.json();
  if(d.success){appendTerm('[patch] Applied. Changed: '+d.changedFiles.join(', '),'info')}
  else{appendTerm('[patch] Failed: '+(d.error||'unknown'),'stderr')}
}
async function createBranch(){
  const name=document.getElementById('branch-name').value;if(!name)return;
  const r=await fetch('/v1/workspaces/'+WS_ID+'/create-branch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
  const d=await r.json();appendTerm('[branch] '+(d.stdout||d.stderr||JSON.stringify(d)),'info');
}
async function commitChanges(){
  const message=document.getElementById('commit-msg').value;if(!message)return;
  const r=await fetch('/v1/workspaces/'+WS_ID+'/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message})});
  const d=await r.json();appendTerm('[commit] '+(d.stdout||d.stderr||JSON.stringify(d)),'info');
}
async function verify(){
  appendTerm('[verify] Running verification pipeline...','info');
  const r=await fetch('/v1/workspaces/'+WS_ID+'/verify',{method:'POST'});const d=await r.json();
  let html='<div class="card"><h3>Verification Results</h3>';
  d.checks.forEach(c=>{
    html+='<div class="flex mt-2"><span class="badge badge-'+(c.passed?'succeeded':'failed')+'">'+(c.passed?'PASS':'FAIL')+'</span> <strong>'+c.label+'</strong> <span class="text-sm">'+c.durationMs+'ms</span></div>';
    if(!c.passed&&c.stderr)html+='<pre class="mono text-sm" style="color:#f87171;margin-top:4px;padding:4px">'+c.stderr.slice(0,500)+'</pre>';
  });
  html+='<div class="mt-2"><span class="badge badge-'+(d.allPassed?'succeeded':'failed')+'">'+(d.allPassed?'ALL PASSED':'FAILED')+'</span></div></div>';
  document.getElementById('verify-results').innerHTML=html;
  appendTerm('[verify] '+(d.allPassed?'All passed':'Some checks failed'),d.allPassed?'info':'stderr');
}
async function createTask(){
  const title=prompt('Task title:');if(!title)return;
  const r=await fetch('/v1/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspaceId:WS_ID,title})});
  const d=await r.json();
  appendTerm('[task] Created: '+d.id,'info');
  loadTasks();
}
async function loadTasks(){
  const r=await fetch('/v1/tasks?workspaceId='+WS_ID);const d=await r.json();
  const el=document.getElementById('task-list');
  if(!d.tasks.length){el.innerHTML='<div class="text-sm">No tasks.</div>';return}
  el.innerHTML=d.tasks.map(t=>
    '<div class="flex mt-2" style="justify-content:space-between" data-testid="row-task-'+t.id+'">'+
    '<div><a href="/ui/task/'+t.id+'">'+t.title+'</a> <span class="badge badge-'+t.status+'">'+t.status+'</span></div>'+
    (t.status==='pending'?'<button class="btn btn-sm btn-primary" onclick="runTask(\\''+t.id+'\\')">Run</button>':'<span class="text-sm">'+(t.resultSummary||'')+'</span>')+
    '</div>'
  ).join('');
}
async function runTask(taskId){
  appendTerm('[task] Running '+taskId+'...','info');
  await fetch('/v1/tasks/'+taskId+'/run',{method:'POST'});
  setTimeout(loadTasks,2000);setTimeout(loadTasks,5000);setTimeout(loadTasks,10000);
}
loadWS();loadTasks();connectWS();
document.getElementById('cmd-input').addEventListener('keydown',e=>{if(e.key==='Enter')execCmd()});
</script>`));
  });

  app.get('/ui/task/:taskId', async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    reply.type('text/html').send(html('Task', `
<div class="container">
  <div id="task-info" data-testid="task-detail"><div class="spinner"></div> Loading task...</div>
  <div class="mt-4">
    <div class="card">
      <h3>Check Results</h3>
      <div id="check-results" data-testid="check-results">Loading...</div>
    </div>
    <div class="card mt-2">
      <h3>Event Timeline</h3>
      <div id="event-timeline" data-testid="event-timeline">Loading...</div>
    </div>
    <div class="card mt-2">
      <h3>Tool Traces</h3>
      <div id="tool-traces" data-testid="tool-traces">Loading...</div>
    </div>
  </div>
</div>`, `<script>
const TASK_ID='${taskId}';
async function loadTask(){
  const r=await fetch('/v1/tasks/'+TASK_ID);const t=await r.json();
  document.getElementById('task-info').innerHTML=
    '<div class="flex" style="justify-content:space-between"><div><h2 style="font-size:18px;color:#fff">'+t.title+'</h2>'+
    '<div class="text-sm">Task ID: '+t.id+' &middot; Workspace: <a href="/ui/workspace/'+t.workspaceId+'">'+t.workspaceId.slice(0,8)+'</a></div></div>'+
    '<span class="badge badge-'+t.status+'" data-testid="status-task">'+t.status+'</span></div>'+
    (t.resultSummary?'<div class="text-sm mt-2">'+t.resultSummary+'</div>':'')+
    (t.status==='pending'?'<button class="btn btn-primary btn-sm mt-2" onclick="runTask()" data-testid="button-run-task">Run Task</button>':'');
  if(t.checkResults){
    let html='';
    Object.entries(t.checkResults).forEach(([k,v])=>{
      html+='<div class="flex mt-2"><span class="badge badge-'+(v.passed?'succeeded':'failed')+'">'+(v.passed?'PASS':'FAIL')+'</span> <strong>'+k+'</strong></div>';
      if(v.output)html+='<pre class="mono text-sm" style="margin-top:4px;padding:4px;max-height:100px;overflow:auto">'+v.output.slice(0,500)+'</pre>';
    });
    document.getElementById('check-results').innerHTML=html||'<div class="text-sm">No results yet.</div>';
  }
  if(t.status==='running'){setTimeout(loadTask,3000)}
}
async function loadEvents(){
  const r=await fetch('/v1/tasks/'+TASK_ID+'/events');const d=await r.json();
  const el=document.getElementById('event-timeline');
  if(!d.events.length){el.innerHTML='<div class="text-sm">No events yet.</div>';return}
  el.innerHTML='<table><thead><tr><th>Time</th><th>Type</th><th>Details</th></tr></thead><tbody>'+
    d.events.map(e=>'<tr data-testid="row-event-'+e.id+'"><td class="text-sm">'+new Date(e.ts).toLocaleTimeString()+'</td><td><span class="badge" style="background:#222">'+e.type+'</span></td><td class="mono text-sm">'+JSON.stringify(e.payload||{}).slice(0,200)+'</td></tr>').join('')+
    '</tbody></table>';
}
async function loadTraces(){
  const r=await fetch('/v1/tasks/'+TASK_ID+'/traces');const d=await r.json();
  const el=document.getElementById('tool-traces');
  if(!d.traces.length){el.innerHTML='<div class="text-sm">No traces yet.</div>';return}
  el.innerHTML='<table><thead><tr><th>Time</th><th>Tool</th><th>Success</th><th>Duration</th><th>Details</th></tr></thead><tbody>'+
    d.traces.map(t=>'<tr data-testid="row-trace-'+t.id+'"><td class="text-sm">'+new Date(t.ts).toLocaleTimeString()+'</td><td>'+t.toolName+'</td><td><span class="badge badge-'+(t.success?'succeeded':'failed')+'">'+(t.success?'OK':'FAIL')+'</span></td><td class="text-sm">'+(t.durationMs||0)+'ms</td><td class="mono text-sm">'+JSON.stringify(t.output||{}).slice(0,150)+'</td></tr>').join('')+
    '</tbody></table>';
}
async function runTask(){
  await fetch('/v1/tasks/'+TASK_ID+'/run',{method:'POST'});
  loadTask();setTimeout(loadEvents,2000);setTimeout(loadTraces,2000);setTimeout(loadTask,3000);setTimeout(loadEvents,6000);setTimeout(loadTraces,6000);
}
loadTask();loadEvents();loadTraces();
</script>`));
  });

  app.get('/ui/tasks', async (_req, reply) => {
    reply.type('text/html').send(html('Tasks', `
<div class="container">
  <h2 style="font-size:18px;color:#fff;margin-bottom:16px" data-testid="text-tasks-title">All Tasks</h2>
  <div id="task-list" data-testid="task-list"><div class="spinner"></div> Loading...</div>
</div>`, `<script>
async function load(){
  const r=await fetch('/v1/tasks');const d=await r.json();
  const el=document.getElementById('task-list');
  if(!d.tasks.length){el.innerHTML='<div class="text-sm">No tasks yet.</div>';return}
  el.innerHTML='<table><thead><tr><th>ID</th><th>Title</th><th>Workspace</th><th>Status</th><th>Summary</th><th>Created</th></tr></thead><tbody>'+
    d.tasks.map(t=>'<tr data-testid="row-task-'+t.id+'"><td class="mono text-sm"><a href="/ui/task/'+t.id+'">'+t.id.slice(0,8)+'</a></td><td>'+t.title+'</td><td><a href="/ui/workspace/'+t.workspaceId+'" class="mono text-sm">'+t.workspaceId.slice(0,8)+'</a></td><td><span class="badge badge-'+t.status+'">'+t.status+'</span></td><td class="text-sm">'+(t.resultSummary||'-')+'</td><td class="text-sm">'+new Date(t.createdAt).toLocaleString()+'</td></tr>').join('')+
    '</tbody></table>';
}
load();
</script>`));
  });

  app.get('/ui/profiles', async (_req, reply) => {
    reply.type('text/html').send(html('Profiles', `
<div class="container">
  <h2 style="font-size:18px;color:#fff;margin-bottom:16px" data-testid="text-profiles-title">Runner Profiles</h2>
  <div id="profile-list" data-testid="profile-list"><div class="spinner"></div> Loading...</div>
</div>`, `<script>
async function load(){
  const r=await fetch('/v1/profiles');const d=await r.json();
  const el=document.getElementById('profile-list');
  el.innerHTML=d.profiles.map(p=>
    '<div class="card" data-testid="card-profile-'+p.id+'"><div class="flex" style="justify-content:space-between"><h3>'+p.name+'</h3><code class="text-sm">'+p.id+'</code></div>'+
    '<div class="text-sm">'+p.description+'</div>'+
    '<div class="text-sm mt-2">Image: <code>'+p.image+'</code></div>'+
    '<div class="mt-2"><strong class="text-sm">Verify Commands:</strong></div>'+
    p.verifyCommands.map(v=>'<div class="flex mt-2"><span class="badge" style="background:#222">'+v.name+'</span> <span class="text-sm">'+v.label+'</span></div><pre class="mono text-sm" style="margin-top:2px;padding:4px;background:#0a0a0a;border-radius:4px">'+v.commands[0]+'</pre>').join('')+
    '</div>'
  ).join('');
}
load();
</script>`));
  });
}
