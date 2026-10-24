import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('.',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const port=Number(process.env.PORT||4173);
createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://preview').pathname;
  let safe;
  try{safe=decodeURIComponent(pathname==='/'?'/index.html':pathname);}
  catch{res.writeHead(400);res.end('Bad request');return;}
  const file=resolve(root,'.'+safe);
  if(!(file===root || file.startsWith(root+'/'))){res.writeHead(403);res.end('Forbidden');return;}
  try{
    if(!(await stat(file)).isFile())throw Error('not a file');
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'0.0.0.0',()=>console.log(`V2 browser playtest ready on 0.0.0.0:${port}`));
