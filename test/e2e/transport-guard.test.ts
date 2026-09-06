import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {describe,it,expect} from 'vitest';
const guard=fileURLToPath(new URL('./transport-guard.cjs',import.meta.url));
const run=(code:string)=>execFileSync(process.execPath,['--require',guard,'-e',code],{encoding:'utf8',env:{...process.env,NODE_OPTIONS:`--require=${guard}`}});
describe('all fixture Node transport clients',()=>{
 it.each(["require('node:net').connect(443,'outside.example')","require('node:net').connect(443,'127.attacker.example')","require('node:tls').connect({host:'outside.example',port:443})","require('node:http').get('http://outside.example')","require('node:dgram').createSocket('udp4').send('x',53,'outside.example')"])('blocks %s before any external transport',code=>{expect(run(`try{${code};process.exitCode=2}catch(error){process.stdout.write(error.message)}`)).toMatch(/fixture_.*forbidden/);});
 it('blocks fetch in an inherited Node child',()=>{expect(run(`require('node:child_process').execFileSync(process.execPath,['-e',"fetch('https://outside.example').then(()=>process.exit(2)).catch(()=>process.stdout.write('blocked'))"],{stdio:'inherit'})`)).toContain('blocked');});
});
