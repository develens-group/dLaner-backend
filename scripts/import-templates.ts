import 'reflect-metadata';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, extname, basename } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TemplatesService } from '../src/templates/templates.service';

async function main() {
  const args = process.argv.slice(2); const rootArg=args.find(x=>x.startsWith('--path=')); const ownerArg=args.find(x=>x.startsWith('--owner=')); const dry=args.includes('--dry-run'); const pending=args.includes('--pending');
  if(!rootArg||!ownerArg) throw new Error('Usage: npm run templates:import -- --path=<directory> --owner=<uuid> [--dry-run] [--pending]');
  const root=resolve(rootArg.slice(7)); const ownerId=ownerArg.slice(8); const files=(await readdir(root,{recursive:true})).filter(x=>extname(x)==='.dlanderlib'); const app=await NestFactory.createApplicationContext(AppModule,{logger:['error','warn']}); const service=app.get(TemplatesService); let imported=0,invalid=0;
  for(const relative of files){try{const full=resolve(root,relative);if(full!==root&&!full.startsWith(root+'\\')&&!full.startsWith(root+'/'))throw new Error('Unsafe path');const library=JSON.parse(await readFile(full,'utf8'));if(dry){console.info(`valid: ${relative}`);(service as any).validateLibrary(library);continue}const title=basename(relative,'.dlanderlib');const template=await service.create(ownerId,{title});await service.createVersion(ownerId,template.id,{library,changelog:'Legacy import'});if(pending)await service.submit(ownerId,template.id);imported++}catch(error){invalid++;console.error(`invalid: ${relative}: ${error instanceof Error?error.message:'unknown error'}`)}}
  console.info(JSON.stringify({scanned:files.length,imported,invalid,dryRun:dry}));await app.close();if(invalid)process.exitCode=1;
}
void main();
