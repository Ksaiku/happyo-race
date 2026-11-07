// build.js - src/ を dist/index.html（1ファイル）にまとめる。Node 標準モジュールのみ。
'use strict';
var fs = require('fs');
var path = require('path');

var SRC = path.join(__dirname, 'src');
var DIST = path.join(__dirname, 'dist');
var JS_FILES = ['core.js', 'audio.js', 'render.js', 'app.js'];

function read(name, optional) {
  var p = path.join(SRC, name);
  if (!fs.existsSync(p)) {
    if (optional) { console.warn('[warn] ' + name + ' が見つかりません（空で続行）'); return ''; }
    console.error('[error] ' + name + ' が見つかりません'); process.exit(1);
  }
  return fs.readFileSync(p, 'utf8');
}

var html = read('index.html');
var css = read('style.css');
var scripts = JS_FILES.map(function (f) {
  var code = read(f, true).replace(/<\/script/gi, '<\\/script');
  return '<script>\n/* ' + f + ' */\n' + code + '\n</script>';
}).join('\n');
var style = '<style>\n' + css.replace(/<\/style/gi, '<\\/style') + '\n</style>';

if (html.indexOf('<!--STYLE-->') < 0 || html.indexOf('<!--SCRIPTS-->') < 0) {
  console.error('[error] index.html に <!--STYLE--> / <!--SCRIPTS--> がありません'); process.exit(1);
}
var out = html.replace('<!--STYLE-->', function () { return style; })
              .replace('<!--SCRIPTS-->', function () { return scripts; });

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
var outPath = path.join(DIST, 'index.html');
fs.writeFileSync(outPath, out, 'utf8');
console.log('built ' + outPath + ' (' + Buffer.byteLength(out, 'utf8') + ' bytes, ' + (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1) + ' KB)');

var re = /\b(?:src|href)\s*=\s*["']?\s*https?:\/\//gi;
var m = out.match(re);
if (m) {
  console.warn('[warn] 外部URLを参照する src/href が ' + m.length + ' 件あります: ' + m.join(' | '));
  process.exit(1);
}
console.log('ok: 外部URL参照なし');
