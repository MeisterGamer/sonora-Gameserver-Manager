import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { JDK_VERSIONS, javaMajor, selectedJava, jdkPackage, installJdk } from '../backend/java.ts';
const checks = [];
function check(name, condition) { assert.ok(condition, name); checks.push(name); }
check('Every major 7 through 26 is represented', JDK_VERSIONS.length === 20 && JDK_VERSIONS[0] === 7 && JDK_VERSIONS.at(-1) === 26);
for (const [output, major] of [['java version "1.7.0_352"',7], ['openjdk version "25.0.4.1"',25], ['javac 1.8.0_504',8], ['javac 26.0.2.1',26]]) check('Parse ' + output, javaMajor(output) === major);
check('Unknown version is not accepted as installed', javaMajor('not found') === 0);
check('Default follows Minecraft requirement', selectedJava(undefined,25) === 25);
check('Explicit newer JDK remains selected', selectedJava('Java 26',25) === 26);
for (const value of ['Java 21', 'Java 27', 'GraalVM 21+', '../../java', 25]) { assert.throws(() => selectedJava(value,25)); checks.push('Reject invalid/incompatible selection ' + value); }
const bytes = Buffer.from('JDK ARCHIVE FIXTURE ONLY'), hash = createHash('sha256').update(bytes).digest('hex');
const pkg = { java_version: [25,0,1], name: 'zulu25.1.1-ca-jdk25.0.1-linux_x64.tar.gz', sha256_hash: hash, download_url: 'https://cdn.azul.com/zulu/bin/zulu25.1.1-ca-jdk25.0.1-linux_x64.tar.gz' };
let metadata = [pkg], archiveBytes = bytes;
const request = async url => String(url).startsWith('https://api.azul.com/') ? new Response(JSON.stringify(metadata)) : new Response(archiveBytes);
check('Provider metadata selects exact major and hash', (await jdkPackage(25,request)).sha256 === hash);
for (const changed of [{download_url:'https://evil.invalid/java.tar.gz'}, {sha256_hash:'invalid'}, {java_version:[26]}, {name:'zulu25-ca-jdk25-linux_musl_x64.tar.gz'}]) {
  metadata = [{...pkg,...changed}]; await assert.rejects(jdkPackage(25,request), /Kein stabiles/); checks.push('Reject metadata ' + Object.keys(changed)[0]);
}
metadata = []; await assert.rejects(jdkPackage(25,request)); checks.push('Unavailable package is reported without fallback'); metadata = [pkg];
const root = fs.mkdtempSync(path.join(os.tmpdir(),'sonora-jdk-test-'));
let calls = [], wrongMajor = false, traversal = false;
const execute = async (command,args) => {
  calls.push([command,args]);
  if (command === 'tar' && args[0] === '-tzf') return {stdout: traversal ? '../outside\n' : 'jdk/bin/java\njdk/bin/javac\n',stderr:''};
  if (command === 'tar') { const target=args.at(-1); fs.mkdirSync(path.join(target,'bin')); for (const tool of ['java','javac']) fs.writeFileSync(path.join(target,'bin',tool),'FIXTURE'); return {stdout:'',stderr:''}; }
  return {stdout:'',stderr: path.basename(command) + (path.basename(command) === 'java' ? ' version "' : ' ') + (wrongMajor ? '21' : '25') + '.0.1"'};
};
try {
  archiveBytes = Buffer.from('corrupt'); await assert.rejects(installJdk(root,25,request,execute), /SHA256/);
  check('Checksum failure never extracts archive', calls.length === 0 && fs.readdirSync(root).length === 0);
  archiveBytes = bytes; traversal = true; await assert.rejects(installJdk(root,25,request,execute), /Archivpfad/);
  check('Traversal rejected and temporary download cleaned', fs.readdirSync(root).length === 0); traversal = false;
  wrongMajor = true; await assert.rejects(installJdk(root,25,request,execute), /entspricht nicht/);
  check('Wrong executable major cannot become installed JDK', fs.readdirSync(root).length === 0); wrongMajor = false;
  const [first,second] = await Promise.all([installJdk(root,25,request,execute),installJdk(root,25,request,execute)]);
  check('Concurrent installations share exact executable', first === second && first === path.join(root,'jdk-25','bin','java'));
  check('Both java and javac are checked', calls.some(([name])=>path.basename(name)==='javac'));
  check('Installed metadata records vendor hash', JSON.parse(fs.readFileSync(path.join(root,'jdk-25','SONORA-JDK.json'))).sha256 === hash);
  const before=calls.filter(([command])=>command==='tar').length;
  await installJdk(root,25,request,execute);
  check('Existing verified JDK is reused without extraction', calls.filter(([command])=>command==='tar').length === before);
} finally { fs.rmSync(root,{recursive:true,force:true}); }
console.log(checks.length + ' JDK regression checks passed; no Java or server process started.');
fs.writeFileSync('audit/java-regression.json',JSON.stringify({checks,javaProcessesStarted:false,networkUsed:false},null,2));
