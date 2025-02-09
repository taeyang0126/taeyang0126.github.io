let floatingToc={init:function(){var e=document.querySelector(".post-toc");if(e){var o=document.createElement("div");o.className="floating-toc",o.innerHTML=`
      <div class="toc-icon">☰</div>
      <div class="toc-content"></div>
    `;let t=o.querySelector(".toc-content");t.innerHTML=e.innerHTML,document.body.appendChild(o),o.querySelector(".toc-icon").onclick=()=>{t.classList.toggle("show")},t.querySelectorAll("a").forEach(e=>{e.onclick=()=>{window.innerWidth<768&&t.classList.remove("show")}})}}};document.addEventListener("DOMContentLoaded",()=>floatingToc.init());