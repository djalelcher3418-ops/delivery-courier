// نقطة البداية
(function () {
  document.documentElement.lang = 'ar';
  document.documentElement.dir = 'rtl';
  // اللعبة أفقية فقط: رسالة عند إمساك الهاتف عمودياً
  const hint = document.createElement('div');
  hint.className = 'rotate-hint';
  hint.innerHTML = '<div class="phone-icon"></div><p>أدِر هاتفك أفقياً</p>';
  document.body.appendChild(hint);
  FC.UI.title();
})();
