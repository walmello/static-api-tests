// api/posts.js
module.exports = () => {
  const posts = [];
  const authors = [
    { id: 101, name: 'João Silva', email: 'joao@example.com' },
    { id: 102, name: 'Ana Souza', email: 'ana@example.com' },
    { id: 103, name: 'Lucas Lima', email: 'lucas@example.com' },
    { id: 104, name: 'Mariana Rocha', email: 'mariana@example.com' }
  ];
  const tagsPool = ['javascript','nodejs','express','api','rest','json','frontend','backend','devops'];
  const commentsPool = [
    { user: 'Maria', message: 'Ótimo post!', likes: 5 },
    { user: 'Pedro', message: 'Muito útil, obrigado!', likes: 3 },
    { user: 'Carlos', message: 'Muito bom, valeu!', likes: 4 },
    { user: 'Ana', message: 'Excelente conteúdo!', likes: 2 }
  ];
  const categories = [
    { id: 10, name: 'Programação', subcategories: [{ id: 101, name: 'Backend' }, { id: 102, name: 'Frontend' }] },
    { id: 20, name: 'Tecnologia', subcategories: [{ id: 201, name: 'Infraestrutura' }] },
    { id: 30, name: 'Design', subcategories: [{ id: 301, name: 'UI' }, { id: 302, name: 'UX' }] }
  ];

  for(let i=1; i<=3; i++){
    const author = authors[i % authors.length];
    const tags = [tagsPool[i % tagsPool.length], tagsPool[(i+3) % tagsPool.length]];
    const comments = [
      { ...commentsPool[i % commentsPool.length], id: i*10+1 },
      { ...commentsPool[(i+1) % commentsPool.length], id: i*10+2 }
    ];
    const category = categories[i % categories.length];

    posts.push({
      id: i,
      title: `Post Aleatório ${i}`,
      content: `Conteúdo do post ${i}`,
      author,
      tags,
      comments,
      category
    });
  }

  return posts;
};
