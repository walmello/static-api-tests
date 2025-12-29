console.log(`\n==== Servidor reiniciado em ${new Date().toLocaleTimeString()} ====`);

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// ====================
// Configuração EJS
// ====================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Pastas a ignorar ao registrar EJS
const EXCLUDE_FOLDERS = ['partials'];

/**
 * Registrar páginas EJS recursivamente
 */
function registerPages(dir, baseRoute = '') {
  const items = fs.readdirSync(dir);

  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!EXCLUDE_FOLDERS.includes(item)) {
        registerPages(fullPath, path.join(baseRoute, item));
      }
    } else if (path.extname(item) === '.ejs') {
      let route = path.join(baseRoute, path.basename(item, '.ejs'));
      if (item === 'index.ejs') route = baseRoute;
      route = '/' + route.replace(/\\/g, '/');
      if (route === '/undefined') route = '/';

      const viewPath = path
        .relative(app.get('views'), fullPath)
        .replace(/\\/g, '/')
        .replace(/\.ejs$/, '');

      app.get(route, (req, res) => {
        res.render(viewPath, { title: 'Minha Página' });
      });

      console.log(`Página registrada: GET ${route} -> ${viewPath}`);
    }
  });
}

// Registrar todas as páginas EJS
registerPages(path.join(__dirname, 'views/pages'));

// ====================
// Função recursiva para criar rotas dinâmicas a partir de objetos/arrays
// ====================
function registerRecursiveRoutes(baseRoute, data) {
  // Rota principal retorna o objeto/array completo
  app.get(baseRoute, (req, res) => res.json(data));

  if (Array.isArray(data)) {
    data.forEach((item, index) => {
      const id = item && item.id !== undefined ? item.id : index;
      registerRecursiveRoutes(`${baseRoute}/${id}`, item);
    });
  } else if (typeof data === 'object' && data !== null) {
    Object.keys(data).forEach(key => {
      registerRecursiveRoutes(`${baseRoute}/${key}`, data[key]);
    });
  }
}

// ====================
// Registrar API recursivamente a partir da pasta /api
// ====================
function registerApi(dir, baseRoute = '/api') {
  const items = fs.readdirSync(dir);

  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      registerApi(fullPath, path.join(baseRoute, item));
    } else {
      const ext = path.extname(item);
      let route;

      if (item === 'index.js' || item === 'index.json') {
        route = baseRoute.replace(/\\/g, '/');
      } else {
        route = path.join(baseRoute, path.basename(item, ext)).replace(/\\/g, '/');
      }

      if (ext === '.js') {
        const handler = require(fullPath);
        const data = typeof handler === 'function' ? handler() : handler;
        registerRecursiveRoutes(route, data);
        console.log(`Endpoint JS registrado (recursivo): GET ${route} -> ${fullPath}`);
      } else if (ext === '.json') {
        const rawData = fs.readFileSync(fullPath, 'utf8');
        const jsonData = JSON.parse(rawData);
        registerRecursiveRoutes(route, jsonData);
        console.log(`JSON registrado (recursivo): GET ${route} -> ${fullPath}`);
      }
    }
  });
}

// Registrar API
const apiDir = path.join(__dirname, 'api');
if (fs.existsSync(apiDir)) registerApi(apiDir);

// ====================
// Iniciar servidor
// ====================
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
