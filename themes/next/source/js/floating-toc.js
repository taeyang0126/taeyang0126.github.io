const floatingToc = {
  init: function() {
    const toc = document.querySelector('.post-toc');
    if (!toc) return;  // 如果页面没有目录则不创建

    const floating = document.createElement('div');
    floating.className = 'floating-toc';
    floating.innerHTML = `
      <div class="toc-icon">☰</div>
      <div class="toc-content"></div>
    `;
    
    // 复制目录内容
    const tocContent = floating.querySelector('.toc-content');
    tocContent.innerHTML = toc.innerHTML;
    
    document.body.appendChild(floating);
    
    // 移动端展开/收起
    floating.querySelector('.toc-icon').onclick = () => {
      tocContent.classList.toggle('show');
    };
    
    // 点击目录项后收起
    tocContent.querySelectorAll('a').forEach(link => {
      link.onclick = () => {
        if (window.innerWidth < 768) {
          tocContent.classList.remove('show');
        }
      };
    });
  }
};

document.addEventListener('DOMContentLoaded', () => floatingToc.init());
