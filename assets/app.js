window.addEventListener("error",function(e){
  var box=document.getElementById("fatalError");
  if(box){
    box.textContent="Dice Duel 오류: "+(e.message||"알 수 없는 오류")+" · F12 개발자도구 Console에서 자세한 내용을 확인할 수 있습니다.";
    box.classList.add("show");
  }
});
window.addEventListener("unhandledrejection",function(e){
  var box=document.getElementById("fatalError");
  if(box){
    var reason=e.reason&&e.reason.message?e.reason.message:String(e.reason||"Promise 오류");
    box.textContent="Dice Duel 오류: "+reason;
    box.classList.add("show");
  }
});
