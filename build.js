const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

// Pastas
const PAGES_DIR = path.join(__dirname, 'views', 'pages');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DIST_DIR = path.join(__dirname, 'dist');

// Limpar dist
if (fs.existsSync(DIST_DIR)) fs.rmSync(DIST_DIR, { recursive: true });
fs.mkdirSync(DIST_DIR, { recursive: true });

// Copiar arquivos estáticos
function copyStatic(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const items = fs.readdirSync(src);
    items.forEach(item => {
        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);
        const stat = fs.statSync(srcPath);
        if (stat.isDirectory()) {
            copyStatic(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    });
}
copyStatic(PUBLIC_DIR, DIST_DIR);

// Função para gerar HTML e JSON
function renderPages(dir, baseRoute = '') {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            renderPages(fullPath, path.join(baseRoute, file));
        } else {
            const ext = path.extname(file);
            
            // EJS -> HTML
            if (ext === '.ejs') {
                let route = path.join(baseRoute, path.basename(file, '.ejs'));
                if (file === 'index.ejs') route = baseRoute || '/';
                route = route.replace(/\\/g, '/');
                
                ejs.renderFile(fullPath, { title: 'Minha Página' }, {}, (err, str) => {
                    if (err) throw err;
                    
                    let outputPath;
                    if (route === '/') {
                        outputPath = path.join(DIST_DIR, 'index.html');
                    } else {
                        const folder = path.join(DIST_DIR, route);
                        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
                        outputPath = path.join(folder, 'index.html');
                    }
                    
                    fs.writeFileSync(outputPath, str, 'utf8');
                    console.log(`HTML gerado: ${outputPath}`);
                });
            }
            
            // JS -> JSON
            else if (ext === '.js') {
                const route = path.join(baseRoute, path.basename(file, '.js')).replace(/\\/g, '/');
                const handler = require(fullPath);
                
                if (typeof handler !== 'function') {
                    console.warn(`O endpoint ${fullPath} não é uma função! Gerando {}.`);
                }
                
                let data;
                try {
                    data = handler(); // executa a função e pega o resultado
                } catch (err) {
                    console.error(`Erro ao executar endpoint ${fullPath}:`, err);
                    data = {};
                }
                
                const jsonStr = JSON.stringify(data || {}, null, 2);
                
                const folder = path.join(DIST_DIR, route);
                if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
                const outputPath = path.join(folder, 'index.json');
                fs.writeFileSync(outputPath, jsonStr, 'utf8');
                
                console.log(`JSON gerado: ${outputPath}`);
            }
        }
    });
}

// Executa build
renderPages(PAGES_DIR);
console.log('Build concluído! 🎉');
