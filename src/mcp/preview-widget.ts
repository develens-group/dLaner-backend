export const PREVIEW_RESOURCE = 'ui://dlander/design-preview-v1.html';
export const previewWidgetHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>dLander preview</title><style>body{font:14px system-ui;margin:0;padding:16px;color:#252432}img{display:block;max-width:100%;max-height:560px;object-fit:contain;margin:auto}footer{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-top:16px}a{background:#6654d9;color:white;padding:10px 16px;border-radius:10px;text-decoration:none}small{color:#777}</style><p id="status">Preparing your design preview...</p><img id="preview" alt="Generated design preview" hidden><footer><small id="expiry"></small><a id="open" hidden target="_blank" rel="noopener noreferrer">Open in dLander</a></footer><script>
let current;
function render(result){
 const data=result?.structuredContent||result;const meta=result?._meta||window.openai?.toolResponseMetadata;
 if(!data?.openUrl)return;
 const url=new URL(data.openUrl);if(url.protocol!=='https:'&&url.hostname!=='localhost')return;
 current=url.href;const link=document.getElementById('open');link.href=current;link.hidden=false;
 const png=meta?.previewPng||result?.content?.find(p=>p.type==='image')?.data;
 if(png){const img=document.getElementById('preview');img.src='data:image/png;base64,'+png;img.hidden=false;document.getElementById('status').textContent='Design preview';}
 document.getElementById('expiry').textContent='Editor link expires '+new Date(data.expiresAt).toLocaleString();
}
document.getElementById('open').onclick=e=>{if(window.openai?.openExternal){e.preventDefault();window.openai.openExternal({href:current});}};
window.addEventListener('openai:set_globals',()=>render(window.openai?.toolOutput));
window.addEventListener('message',event=>{if(event.source!==window.parent)return;const m=event.data;if(m?.method==='ui/notifications/tool-result')render(m.params);if(m?.id===1&&m.result){window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized'},'*');}});
if(window.openai?.toolOutput)render(window.openai.toolOutput);
window.parent.postMessage({jsonrpc:'2.0',id:1,method:'ui/initialize',params:{appInfo:{name:'dlander-preview',version:'1.0.0'},appCapabilities:{},protocolVersion:'2026-01-26'}},'*');
</script></html>`;
