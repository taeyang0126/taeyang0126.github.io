let imageViewer={init:function(){document.querySelectorAll(".post-body img").forEach(e=>{e.onclick=()=>this.showImage(e.src),e.style.cursor="zoom-in"})},showImage:function(e){let o=document.createElement("div");o.className="image-viewer",o.innerHTML=`
      <div class="viewer-overlay"></div>
      <div class="viewer-container">
        <img src="${e}">
        <div class="viewer-close">×</div>
      </div>
    `,document.body.appendChild(o),document.body.style.overflow="hidden";e=()=>{o.remove(),document.body.style.overflow=""};o.querySelector(".viewer-overlay").onclick=e,o.querySelector(".viewer-close").onclick=e}};document.addEventListener("DOMContentLoaded",()=>imageViewer.init());