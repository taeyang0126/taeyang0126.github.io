let pageLoading={init:function(){let e=document.createElement("div");e.className="page-loading",e.innerHTML=`
      <div class="loading-spinner">
        <div class="bounce1"></div>
        <div class="bounce2"></div>
        <div class="bounce3"></div>
      </div>
    `,document.body.appendChild(e),window.addEventListener("load",()=>{e.classList.add("loaded"),setTimeout(()=>e.remove(),300)})}};document.addEventListener("DOMContentLoaded",()=>pageLoading.init());