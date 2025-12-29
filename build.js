(async () => {
    const express = require('express');
    const path = require('path');
    const fs = require('fs');
    const fsExtra = require('fs-extra');
    const crypto = require('crypto');
    const app = express();
    const DIST = path.join(__dirname, 'dist');
    const publicFiles = new Set();
    
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));
    
    const EXCLUDE_FOLDERS = ['partials'];
    const pages = [];
    const apiRoutes = new Map();
    const apiParents = new Set();
    const validFiles = new Set();
    
    // Função auxiliar para garantir que o diretório existe
    function ensureDir(dir) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    // Função para gerar hash de conteúdo
    function hash(content) {
        return crypto.createHash('sha1').update(content).digest('hex');
    }
    
    // Função para escrever arquivos se houver mudanças
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
        if (writeIfChanged(file, html)) {
            console.log(`✔ HTML ${route}`);
        }
    }
    
    function collectPages(dir, baseRoute = '') {
        for (const item of fs.readdirSync(dir)) {
            const full = path.join(dir, item);
            const stat = fs.statSync(full);
            if (stat.isDirectory() && !EXCLUDE_FOLDERS.includes(item)) {
                collectPages(full, path.join(baseRoute, item));
            } else if (item.endsWith('.ejs')) {
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
            pages.map(p => new Promise((resolve, reject) => {
                app.render(p.view, { require }, (err, html) => {
                    if (err) reject(err);
                    else {
                        writeHtml(p.route, html);
                        resolve();
                    }
                });
            }))
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
        if (writeIfChanged(file, json)) {
            console.log(`✔ API ${route} -> ${path.relative(DIST, file)}`);
        }
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
            const ext = path.extname(item);
            const name = item.replace(ext, '');
            const route = item === 'index.js' || item === 'index.json' ? baseRoute : path.join(baseRoute, name);
            const normalized = route.replace(/\\/g, '/');
            if (stat.isDirectory()) loadApi(full, normalized);
            else {
                try {
                    if (ext === '.js') {
                        const mod = require(full);
                        const data = typeof mod === 'function' ? mod() : mod;
                        collectApi(normalized, data);
                    } else if (ext === '.json') {
                        const data = JSON.parse(fs.readFileSync(full, 'utf8'));
                        collectApi(normalized, data);
                    }
                } catch (err) {
                    console.warn(`Erro ao carregar ${full}: ${err.message}`);
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
// CLEAN ORPHANS
// =========================
function cleanOrphanFiles(dir) {
    if (!fs.existsSync(dir)) return;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        
        // Caminho relativo dentro da pasta 'public'
        const relativePath = path.relative(path.join(__dirname, 'public'), fullPath);
        
        // Caminho relativo dentro da pasta 'dist' (mesmo caminho do arquivo, sem o caminho completo)
        const realPath = path.relative(path.join(__dirname, 'dist'), fullPath);  // Caminho relativo a 'dist'

        // Verifica se o arquivo/diretório está registrado em 'publicFiles' 
        if (publicFiles.has(realPath)) {
            //console.log(`📂 Ignorando arquivo/diretório marcado em publicFiles: ${relativePath}`);
            continue;  // Ignora a limpeza se estiver em publicFiles
        }

        // Se for diretório, chamamos recursivamente a função
        if (entry.isDirectory()) {
            cleanOrphanFiles(fullPath);

            // Se o diretório estiver vazio após a limpeza, removemos
            if (fs.existsSync(fullPath) && fs.readdirSync(fullPath).length === 0) {
                fs.rmdirSync(fullPath);
                console.log(`🗑 Diretório órfão removido: ${fullPath}`);
            }
        } else if (entry.isFile() && !validFiles.has(fullPath)) {
            // Se for arquivo e não está na lista de arquivos válidos, removemos
            fs.unlinkSync(fullPath);
            console.log(`🗑 Arquivo órfão removido: ${fullPath}`);
        }
    }
}





// Função para copiar o conteúdo de 'public' para 'dist' e registrar todos os arquivos de 'public' em 'publicFiles'
// Função para copiar o conteúdo de 'public' para 'dist' e registrar os arquivos de 'public' com o nome relativo
async function copyPublicToDist() {
    const publicDir = path.join(__dirname, 'public');
    const distDir = path.join(__dirname, 'dist');
    ensureDir(distDir); // Garantir que o diretório de destino exista
    
    const items = await fs.promises.readdir(publicDir);
    
    for (const item of items) {
        const srcPath = path.join(publicDir, item);
        const destPath = path.join(distDir, item);
        
        const statSrc = await fs.promises.stat(srcPath);
        let statDest = null;
        
        // Adiciona o nome do arquivo/diretório relativo à pasta 'public' em 'publicFiles'
        const relativePath = path.relative(publicDir, srcPath); // Caminho relativo em relação à pasta 'public'
        publicFiles.add(relativePath);

        // Verifica se o arquivo/diretório já existe no destino
        if (fs.existsSync(destPath)) {
            statDest = await fs.promises.stat(destPath);
        }

        // Se o arquivo de destino não existe ou o arquivo de origem foi modificado
        if (!statDest || statSrc.mtime > statDest.mtime) {
            if (statSrc.isDirectory()) {
                // Se for diretório, copia recursivamente
                await fsExtra.copy(srcPath, destPath, { overwrite: true });
                console.log(`✔ Novo diretório copiado: ${srcPath}`);
            } else {
                // Se for arquivo, copia
                await fsExtra.copy(srcPath, destPath, { overwrite: true });
                console.log(`✔ Arquivo copiado: ${srcPath}`);
            }
            validFiles.add(destPath); // Marca o arquivo ou diretório como válido
        } else {
            //console.log(`📂 Arquivo não modificado (ignorando): ${srcPath}`);
        }
    }
}



// =========================
// BUILD
// =========================
console.time('build-time');
ensureDir(DIST);

// Coleta as páginas e as APIs
collectPages(path.join(__dirname, 'views/pages'));
const apiDir = path.join(__dirname, 'api');
if (fs.existsSync(apiDir)) loadApi(apiDir);

// Paralelizar as tarefas de build
await Promise.all([buildPages(), buildApi()]);

// Copia os arquivos de public para dist
await copyPublicToDist();

// Limpa arquivos órfãos
cleanOrphanFiles(DIST);

console.timeEnd('build-time');
console.log('\n⚡ BUILD FINALIZADO (paralelizado + limpeza)');
})();
