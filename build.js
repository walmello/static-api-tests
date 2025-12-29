(async () => {
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
  const validFiles = new Set();

  function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
  function hash(content) { return crypto.createHash('sha1').update(content).digest('hex'); }
  function writeIfChanged(file, content) {
    validFiles.add(file);
    if (fs.existsSync(file)) {
      const old = fs.readFileSync(file, 'utf8');
      if (hash(old) === hash(content)) return false;
    }
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, content);
    return true;
  }

  // =========================
  // HTML / PAGES
  // =========================
  function writeHtml(route, html) {
    const file = route === '/' ? path.join(DIST, 'index.html') : path.join(DIST, route, 'index.html');
    const changed = writeIfChanged(file, html);
    console.log(changed ? `✔ HTML ${route}` : `↺ HTML ${route}`);
  }

  function collectPages(dir, baseRoute = '') {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory() && !EXCLUDE_FOLDERS.includes(item)) collectPages(full, path.join(baseRoute, item));
      else if (item.endsWith('.ejs')) {
        let route = path.join(baseRoute, item.replace('.ejs', ''));
        if (item === 'index.ejs') route = baseRoute;
        route = '/' + route.replace(/\\/g, '/');
        if (route === '/undefined') route = '/';
        const view = path.relative(app.get('views'), full).replace(/\\/g, '/').replace('.ejs', '');
        pages.push({ route, view });
      }
    }
  }

  async function buildPages() {
    await Promise.all(
      pages.map(p =>
        new Promise((resolve, reject) => {
          app.render(p.view, { title: 'Minha Página' }, (err, html) => {
            if (err) reject(err);
            else {
              writeHtml(p.route, html);
              resolve();
            }
          });
        })
      )
    );
  }

  // =========================
  // API
  // =========================
  function writeApi(route, data) {
    const clean = route.replace(/^\/api\/?/, '');
    const isParent = apiParents.has(route);
    let file;
    if (isParent) {
      const segments = clean.split('/');
      const parentName = segments.pop() || 'index';
      const dir = path.join(DIST, 'api', ...segments);
      ensureDir(dir);
      file = path.join(dir, `${parentName}.json`);
    } else {
      const dir = path.join(DIST, 'api', ...clean.split('/').slice(0, -1));
      ensureDir(dir);
      const last = clean.split('/').pop();
      file = path.join(dir, `${last}.json`);
    }
    const json = JSON.stringify(data, null, 2);
    writeIfChanged(file, json);
    console.log(`✔ API ${route} -> ${path.relative(DIST, file)}`);
  }

  function collectApi(route, data) {
    apiRoutes.set(route, data);
    if (Array.isArray(data)) {
      data.forEach((item, i) => {
        const id = item?.id ?? i;
        apiParents.add(route);
        collectApi(`${route}/${id}`, item);
      });
    } else if (data && typeof data === 'object') {
      for (const key in data) {
        apiParents.add(route);
        collectApi(`${route}/${key}`, data[key]);
      }
    }
  }

  function loadApi(dir, baseRoute = '/api') {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) loadApi(full, path.join(baseRoute, item));
      else {
        const ext = path.extname(item);
        const name = item.replace(ext, '');
        const route = item === 'index.js' || item === 'index.json' ? baseRoute : path.join(baseRoute, name);
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

  async function buildApi() {
    await Promise.all(
      Array.from(apiRoutes.entries()).map(([route, data]) =>
        new Promise(resolve => {
          writeApi(route, data);
          resolve();
        })
      )
    );
  }

  // =========================
  // PUBLIC
  // =========================
  function copyPublicOptimized() {
  const src = path.join(__dirname, 'public');
  const dest = DIST; // <-- mudou de dist/public para dist
  if (!fs.existsSync(src)) return;

  const copyRecursive = (srcDir, destDir) => {
    fs.mkdirSync(destDir, { recursive: true });
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name); // mantém estrutura interna
      if (entry.isDirectory()) copyRecursive(srcPath, destPath);
      else {
        let shouldCopy = true;
        if (fs.existsSync(destPath)) {
          const srcHash = hash(fs.readFileSync(srcPath));
          const destHash = hash(fs.readFileSync(destPath));
          if (srcHash === destHash) shouldCopy = false;
        }
        if (shouldCopy) fs.copyFileSync(srcPath, destPath);
        validFiles.add(destPath);
      }
    }
  };

  copyRecursive(src, dest);
  console.log(`✔ Public copiado para ${dest} (otimizado)`);
}


  // =========================
  // CLEAN ORPHANS
  // =========================
  function cleanOrphanFiles(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        cleanOrphanFiles(fullPath);
        if (fs.existsSync(fullPath) && fs.readdirSync(fullPath).length === 0) fs.rmdirSync(fullPath);
      } else if (entry.isFile() && !validFiles.has(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log(`🗑 Arquivo órfão removido: ${fullPath}`);
      }
    }
  }

  // =========================
  // BUILD
  // =========================
  ensureDir(DIST);
  collectPages(path.join(__dirname, 'views/pages'));

  const apiDir = path.join(__dirname, 'api');
  if (fs.existsSync(apiDir)) loadApi(apiDir);

  // Paralelizar páginas + API + Public
  await Promise.all([buildPages(), buildApi(), copyPublicOptimized()]);

  // Limpeza de órfãos
  cleanOrphanFiles(DIST);

  console.log('\n⚡ BUILD FINALIZADO (paralelizado + limpeza + public otimizado)');
})();
