const snow = {
  init: function() {
    const container = document.querySelector('body');
    const createSnow = () => {
      const snow = document.createElement('span');
      snow.className = 'snow';
      snow.style.left = Math.random() * 100 + '%';
      snow.style.animationDuration = (Math.random() * 3 + 2) + 's';
      snow.style.opacity = Math.random();
      snow.innerHTML = '❅';
      container.appendChild(snow);
      
      // 动画结束后删除
      setTimeout(() => snow.remove(), 5000);
    }
    
    // 每隔一段时间创建新雪花
    setInterval(createSnow, 200);
  }
}

document.addEventListener('DOMContentLoaded', snow.init);
