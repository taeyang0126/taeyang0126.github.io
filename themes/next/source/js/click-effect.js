const clickEffect = {
  init: function() {
    document.addEventListener('click', function(e) {
      const heart = document.createElement('span')
      heart.className = 'click-effect'
      
      const x = e.clientX
      const y = e.clientY
      
      heart.style.left = x - 10 + 'px'
      heart.style.top = y - 10 + 'px'
      
      document.body.appendChild(heart)
      
      setTimeout(() => {
        heart.remove()
      }, 1000)
    })
  }
}

document.addEventListener('DOMContentLoaded', clickEffect.init)
