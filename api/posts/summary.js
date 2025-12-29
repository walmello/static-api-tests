const fs = require('fs');
const path = require('path');

module.exports = () => {
  const postsPath = path.join(__dirname, '..' ,'posts.json');

  let posts = [];
  try {
    posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
  } catch (err) {
    console.error('Erro ao ler posts.json:', err);
  }

  // Exemplo de processamento: retorna apenas títulos e autores
  const summary = posts.map(post => ({
    id: post.id,
    title: post.title,
    author: post.author
  }));

  return summary;
};
