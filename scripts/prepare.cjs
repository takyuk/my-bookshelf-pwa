const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const git = (...args) => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\','/')}`, ...args], {cwd:root, encoding:'utf8'}).trim();
const commit = git('rev-parse', 'HEAD');
const publishing = process.argv.includes('--publish');
const preview = process.argv.includes('--preview');
const dirty = !!git('status', '--porcelain', '--', '.', ':!js/version.js', ':!dist');
if(publishing && dirty) throw new Error('公開用ファイルはコミット済みの作業ツリーから生成してください。');
const label = publishing ? `コミット ${commit.slice(0,7)}` : `基準コミット ${commit.slice(0,7)}${dirty ? '（未コミット変更あり）' : ''}`;
const version = `globalThis.BOOKSHELF_VERSION = ${JSON.stringify({commit, label})};\n`;
if(publishing || preview){
  const output = path.join(root, 'dist');
  fs.mkdirSync(output, {recursive:true});
  for(const file of ['index.html','manifest.webmanifest','sw.js','css','js','icons','vendor']){
    fs.cpSync(path.join(root,file), path.join(output,file), {recursive:true});
  }
  fs.writeFileSync(path.join(output,'js/version.js'),version);
  const worker = fs.readFileSync(path.join(output,'sw.js'),'utf8').replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = 'my-bookshelf-pwa-${commit}${preview ? '-preview' : ''}';`);
  fs.writeFileSync(path.join(output,'sw.js'),worker);
} else {
  fs.writeFileSync(path.join(root,'js/version.js'),version);
}
console.log(label);
