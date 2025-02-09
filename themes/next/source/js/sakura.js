const sakura = {
  init: function() {
    const canvas = document.createElement('canvas')
    canvas.id = 'sakura'
    canvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:0'
    document.body.appendChild(canvas)
    
    const ctx = canvas.getContext('2d')
    const width = window.innerWidth
    const height = window.innerHeight
    canvas.width = width
    canvas.height = height
    
    const petals = []
    const petalNum = 50
    
    for (let i = 0; i < petalNum; i++) {
      petals.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 6 + 5,
        speedX: Math.random() * 2 - 1,
        speedY: Math.random() * 1 + 1,
        rotation: Math.random() * 360
      })
    }
    
    function animate() {
      ctx.clearRect(0, 0, width, height)
      petals.forEach(petal => {
        petal.x += petal.speedX
        petal.y += petal.speedY
        petal.rotation += 0.5
        
        if (petal.y > height) {
          petal.y = -10
          petal.x = Math.random() * width
        }
        
        // 绘制樱花瓣
        ctx.save()
        ctx.translate(petal.x, petal.y)
        ctx.rotate(petal.rotation * Math.PI / 180)
        ctx.fillStyle = '#ffd1dc'
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.bezierCurveTo(-5, -5, -10, 0, 0, 10)
        ctx.bezierCurveTo(10, 0, 5, -5, 0, 0)
        ctx.fill()
        ctx.restore()
      })
      requestAnimationFrame(animate)
    }
    animate()
  }
}

document.addEventListener('DOMContentLoaded', sakura.init)
