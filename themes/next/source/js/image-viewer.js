const imageViewer = {
  init: function() {
    const images = document.querySelectorAll('.post-body img');
    images.forEach(img => {
      img.onclick = () => this.showImage(img.src);
      img.style.cursor = 'zoom-in';
    });
  },

  showImage: function(src) {
    const viewer = document.createElement('div');
    viewer.className = 'image-viewer';
    viewer.innerHTML = `
      <div class="viewer-overlay"></div>
      <div class="viewer-container">
        <img src="${src}">
        <div class="viewer-close">×</div>
      </div>
    `;
    
    document.body.appendChild(viewer);
    document.body.style.overflow = 'hidden';
    
    // 关闭查看器
    const close = () => {
      viewer.remove();
      document.body.style.overflow = '';
    };
    
    viewer.querySelector('.viewer-overlay').onclick = close;
    viewer.querySelector('.viewer-close').onclick = close;
  }
};

document.addEventListener('DOMContentLoaded', () => imageViewer.init());
