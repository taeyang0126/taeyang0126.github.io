const ribbon = {
  init: function() {
    document.addEventListener('touchmove', function(e) {
      e.preventDefault()
    })
    
    const canvas = document.createElement('canvas')
    canvas.id = 'ribbon'
    canvas.style.cssText = 'position:fixed;top:0;left:0;z-index:-1;'
    document.getElementsByTagName('body')[0].appendChild(canvas)
    
    const config = {
      alpha: 0.6,
      zIndex: -1,
      size: 90,
      r: 0,
      g: 0,
      b: 0
    }
    
    const context = canvas.getContext('2d')
    let pr = window.devicePixelRatio || 1
    let width = window.innerWidth
    let height = window.innerHeight
    let points = []
    
    // 初始化尺寸
    canvas.width = width * pr
    canvas.height = height * pr
    context.scale(pr, pr)
    context.globalAlpha = config.alpha
    
    // 创建动画
    function animate() {
      context.clearRect(0, 0, width, height)
      points.forEach(function(point) {
        point.move()
        point.draw(context)
      })
      requestAnimationFrame(animate)
    }
    animate()
  }
}

document.addEventListener('DOMContentLoaded', ribbon.init)
