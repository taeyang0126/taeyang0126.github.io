'use strict';

hexo.extend.filter.register('before_generate', function() {
  const posts = hexo.locals.get('posts').data;
  
  posts.forEach(current => {
    if (!current.tags || !current.tags.length) return;
    
    const currentTags = new Set(current.tags.map(tag => tag.name));
    
    const related = posts
      .filter(post => {
        if (post.path === current.path) return false;
        
        const postTags = new Set(post.tags.map(tag => tag.name));
        const commonTags = [...currentTags].filter(tag => postTags.has(tag));
        
        return commonTags.length > 0;
      })
      .sort((a, b) => b.date - a.date)
      .map(post => ({
        title: post.title,
        path: post.path,
        date: post.date,
        // 添加更多需要的字段
        _content: post._content,
        source: post.source
      }))
      .slice(0, 5);
    
    current.related_posts = related;
  });
});
