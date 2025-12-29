const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const DIST = path.join(__dirname, 'dist');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const EXCLUDE_FOLDERS = ['partials'];
const pages = [];
const apiRoutes = new Map();
const apiParents = new Set();
const validFiles = new Set(); // arquivos válidos para limpeza

/* =========================
   UTIL
========================= */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function hash(content) {
  return crypto.createHash('sha1').update(content).digest('hex');
}

function writeIfChanged(file, content) {
  validFiles.add(file); // marca como arquivo válido
  if (fs.existsSync(file)) {
    const old = fs.readFileSync(file, 'utf8');
    if (hash(old) === hash(content)) return false;
  }
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content);
  return true;
}

/* =========================
   HTML
========================= */
function writeHtml(route, html) {
  const file =
    route === '/'
      ? path.join(DIST, 'index.html') // raiz
      : path.join(DIST, route, 'index.html'); // subpasta

  const changed = writeIfChanged(file, html);
  console.log(changed ? `✔ HTML ${route}` : `↺ HTML ${route}`);
}

/* =========================
   API
========================= */
function writeApi(route, data) {
  const clean = route.replace(/^\/+/, ''); // remove barra inicial
  const isParent = apiParents.has(route);

  let file;
  if (isParent) {
    // posts.json dentro de dist/api
    const segments = clean.split('/');
    const parentName = segments[segments.length - 1] || 'index';
    file = path.join(DIST, 'api', ...segments.slice(0, -1), `${parentName}.json`);
  } else {
    file = path.join(DIST, 'api', ...clean.split('/')) + '.json';
  }

  const json = JSON.stringify(data, null, 2);
  const changed = writeIfChanged(file, json);

  console.log(
    changed
      ? `✔ API ${route} -> ${path.relative(DIST, file)}`
      : `↺ API ${route} (sem mudanças)`
  );

  if (isParent) {
    console.log(`  (Resumo da pasta: ${file}. Para itens individuais, use /${clean}/id.json)`);
  }
}


/* =========================
   PAGES
========================= */
function collectPages(dir, baseRoute = '') {
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      if (!EXCLUDE_FOLDERS.includes(item)) {
        collectPages(full, path.join(baseRoute, item));
      }
    } else if (item.endsWith('.ejs')) {
      let route = path.join(baseRoute, item.replace('.ejs', ''));
      if (item === 'index.ejs') route = baseRoute;

      route = '/' + route.replace(/\\/g, '/');
      if (route === '/undefined') route = '/';

      const view = path
        .relative(app.get('views'), full)
        .replace(/\\/g, '/')
        .replace('.ejs', '');

      pages.push({ route, view });
    }
  }
}

function buildPages() {
  pages.forEach(p => {
    app.render(p.view, { title: 'Minha Página' }, (err, html) => {
      if (err) throw err;
      writeHtml(p.route, html);
    });
  });
}

/* =========================
   API COLETA
========================= */
function collectApi(route, data) {
  apiRoutes.set(route, data);

  if (Array.isArray(data)) {
    data.forEach((item, i) => {
      const id = item?.id ?? i;
      apiParents.add(route); // marca como pai
      collectApi(`${route}/${id}`, item);
    });
  } else if (data && typeof data === 'object') {
    for (const key in data) {
      apiParents.add(route); // marca como pai
      collectApi(`${route}/${key}`, data[key]);
    }
  }
}

function loadApi(dir, baseRoute = '/api') {
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      loadApi(full, path.join(baseRoute, item));
    } else {
      const ext = path.extname(item);
      const name = item.replace(ext, '');

      const route =
        item === 'index.js' || item === 'index.json'
          ? baseRoute
          : path.join(baseRoute, name);

      const normalized = route.replace(/\\/g, '/');

      if (ext === '.js') {
        const mod = require(full);
        const data = typeof mod === 'function' ? mod() : mod;
        collectApi(normalized, data);
      }

      if (ext === '.json') {
        const data = JSON.parse(fs.readFileSync(full, 'utf8'));
        collectApi(normalized, data);
      }
    }
  }
}

function buildApi() {
  for (const [route, data] of apiRoutes.entries()) {
    writeApi(route, data);
  }
}

/* =========================
   LIMPEZA DE ÓRFÃOS
========================= */
function cleanOrphanFiles(dir) {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      cleanOrphanFiles(fullPath);

      // remover pasta se ficou vazia
      if (fs.existsSync(fullPath) && fs.readdirSync(fullPath).length === 0) {
        fs.rmdirSync(fullPath);
      }
    } else if (entry.isFile()) {
      if (!validFiles.has(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log(`🗑 Arquivo órfão removido: ${fullPath}`);
      }
    }
  }
}

/* =========================
   PUBLIC OTIMIZADO
========================= */
function copyPublicOptimized() {
  const src = path.join(__dirname, 'public');
  const dest = path.join(DIST, 'public');
  if (!fs.existsSync(src)) return;

  const copyRecursive = (srcDir, destDir) => {
    ensureDir(destDir);
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);

      if (entry.isDirectory()) {
        copyRecursive(srcPath, destPath);
      } else {
        let shouldCopy = true;
        if (fs.existsSync(destPath)) {
          const srcHash = hash(fs.readFileSync(srcPath));
          const destHash = hash(fs.readFileSync(destPath));
          if (srcHash === destHash) shouldCopy = false; // arquivos idênticos → não copiar
        }
        if (shouldCopy) fs.copyFileSync(srcPath, destPath);
        validFiles.add(destPath);
      }
    }
  };

  copyRecursive(src, dest);
  console.log(`✔ Public copiado para ${dest} (otimizado)`);
}

/* =========================
   BUILD
========================= */
ensureDir(DIST);

// HTML
collectPages(path.join(__dirname, 'views/pages'));
buildPages();

// API
const apiDir = path.join(__dirname, 'api');
if (fs.existsSync(apiDir)) {
  loadApi(apiDir);
  buildApi();
}

// Public
copyPublicOptimized();

// Limpeza de órfãos
cleanOrphanFiles(DIST);

console.log('\n⚡ BUILD FINALIZADO (incremental + limpeza de órfãos + public otimizado)');
