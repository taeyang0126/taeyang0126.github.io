const pageLoading = {
  init: function() {
    const loading = document.createElement('div');
    loading.className = 'page-loading';
    loading.innerHTML = `
      <div class="loading-spinner">
        <div class="bounce1"></div>
        <div class="bounce2"></div>
        <div class="bounce3"></div>
      </div>
    `;
    
    document.body.appendChild(loading);
    
    window.addEventListener('load', () => {
      loading.classList.add('loaded');
      setTimeout(() => loading.remove(), 300);
    });
  }
};

document.addEventListener('DOMContentLoaded', () => pageLoading.init());
