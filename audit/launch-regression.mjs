import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateOSScripts } from '../src/data/serverStore.ts';
import { minecraftLaunch } from '../src/data/launchPlan.ts';
const checks=[];
function check(name,condition) { assert.ok(condition,name); checks.push(name); }
const base={id:'srv_test', category:'minecraft', minecraftType:'paper', version:'26.3', javaVersion:'Java 25', allocatedRamGb:6, port:25566, installationRoot:'/root/sonora-Gameserver-Manager', installationUser:'root', name:'$(touch /tmp/injected)'};
for (const [engine,jar] of [['paper','paper.jar'],['purpur','purpur.jar'],['vanilla','server.jar']]) {
  const server={...base,minecraftType:engine}; const plan=minecraftLaunch(server),scripts=generateOSScripts(server);
  check(engine+' uses matching JAR and selected JDK',plan.jar===jar && scripts.linuxSh.includes('jdk-25') && scripts.linuxSh.includes("'"+jar+"'"));
  check(engine+' exports the same arguments as actual backend launch',plan.args.every(arg=>scripts.linuxSh.includes("'"+arg+"'")));
  check(engine+' Windows launch uses explicit JAVA_HOME and correct JAR',scripts.windowsBat.includes('%JAVA_HOME%\\bin\\java.exe') && scripts.windowsBat.includes('"'+jar+'"'));
}
const scripts=generateOSScripts(base);
check('Linux switches to script directory before launch',scripts.linuxSh.includes('cd -- "$(dirname'));
check('Linux derives installation root without opt',scripts.linuxSh.includes('cd ../../..') && !scripts.linuxSh.includes('/opt/'));
check('Selected JDK 26 is retained in exported script',generateOSScripts({...base,javaVersion:'Java 26'}).linuxSh.includes('jdk-26'));
check('Server name cannot inject shell commands',!scripts.linuxSh.includes(base.name));
check('EULA is required before exported Linux start',scripts.linuxSh.includes('eula') && scripts.linuxSh.includes('Accept the Minecraft EULA'));
check('Fractional RAM is represented in MiB',minecraftLaunch({...base,allocatedRamGb:1.5}).args.includes('-Xmx1536M'));
check('Standalone service uses real installation folder',scripts.linuxSystemd.includes(base.installationRoot+'/data/servers/'+base.id) && !scripts.linuxSystemd.includes('/opt/'));
check('Unknown installation path never generates a false unit',generateOSScripts({...base,installationRoot:undefined}).linuxSystemd.includes('not known'));
for(const javaVersion of ['Java 21','Java 27','Zulu 21+']) {assert.throws(()=>minecraftLaunch({...base,javaVersion}));checks.push('Incompatible runtime rejected '+javaVersion);}
const native=generateOSScripts({...base,category:'survival',gameId:'valheim',linuxStartArgs:'-port 2456 -name "two words"'});
check('Native launcher uses verified executable and quoted arguments',native.linuxSh.includes("'./valheim_server.x86_64'")&&native.linuxSh.includes("'two words'"));
check('Valheim has per-instance saves and library path',native.linuxSh.includes('-savedir "$PWD/saves"')&&native.linuxSh.includes('SteamAppId=892970'));
check('Unsupported native adapter fails explicitly',generateOSScripts({...base,category:'survival',gameId:'unknown'}).linuxSh.includes('exit 1'));
check('Unverified Docker deployment has no fake Java 21 image',!scripts.dockerfile.includes('temurin:21'));
console.log(checks.length+' launch regression checks passed; no process started.');
fs.writeFileSync('audit/launch-regression.json',JSON.stringify({checks,processesStarted:false},null,2));
