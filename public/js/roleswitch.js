/* 右下角悬浮「切换端」按钮：用户端 / 骑手端 / 商家端 / 入口页 任意跳转
 * 切换只是换视角，订单与聊天记录都在服务端，跳过去照旧可见。 */
(function () {
  'use strict';
  const ITEMS = [
    { href: '/user.html', emoji: '🍜', name: '用户端', desc: '点外卖 / 跟踪骑手' },
    { href: '/rider.html', emoji: '🛵', name: '骑手端', desc: '抢单 / 导航取餐' },
    { href: '/merchant.html', emoji: '🏪', name: '商家端', desc: '接单 / 出餐' },
    { href: '/', emoji: '🏠', name: '入口页', desc: '三个端的导航' }
  ];

  function build() {
    const phone = document.getElementById('phone');
    if (!phone || document.getElementById('switchFab')) return;
    const here = location.pathname;

    const fab = document.createElement('div');
    fab.className = 'switch-fab';
    fab.id = 'switchFab';
    fab.innerHTML = '<span class="sf-ico">⇄</span><span>切换端</span>';

    const menu = document.createElement('div');
    menu.className = 'switch-menu';
    menu.id = 'switchMenu';
    menu.innerHTML = ITEMS.map((it) => {
      const on = it.href === here;
      return '<a class="sm-item ' + (on ? 'on' : '') + '" href="' + it.href + '">' +
        '<span class="sm-e">' + it.emoji + '</span>' +
        '<span class="grow"><div class="sm-n">' + it.name + (on ? '（当前）' : '') + '</div>' +
        '<div class="sm-d">' + it.desc + '</div></span>' +
        (on ? '<span class="sm-c">✓</span>' : '<span class="sm-go">›</span>') +
        '</a>';
    }).join('') +
      '<div class="sm-tip">切换只换视角，订单与聊天记录都保留</div>';

    fab.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('show');
    });
    document.addEventListener('click', () => menu.classList.remove('show'));
    menu.addEventListener('click', (e) => e.stopPropagation());

    phone.appendChild(fab);
    phone.appendChild(menu);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
