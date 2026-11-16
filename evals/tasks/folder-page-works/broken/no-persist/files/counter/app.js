(function () {
  var count = 0;
  var out = document.getElementById("count");
  function show() {
    out.textContent = String(count);
    localStorage.setItem("count", String(count));
  }
  document.getElementById("plus").onclick = function () { count++; show(); };
  document.getElementById("minus").onclick = function () { count--; show(); };
  document.getElementById("reset").onclick = function () { count = 0; show(); };
  show();
})();
