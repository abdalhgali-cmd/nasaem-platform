/* NASAEM design concepts — shared data + icons (prototype only, not shipped).
   Services mirror backend/prisma/seed.js. No prices, no availability. */
(function () {
  var P = {
    plane: 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
    bed: 'M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9',
    kaaba: 'M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10M4 10.5l8 4 8-4',
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M5 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    briefcase: 'M3 7h18v13H3zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18',
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
    ship: 'M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M19.4 17.5 21 11l-9-4-9 4 1.6 6.5M12 2v5M8 4h8',
    globe: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
    calendar: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
    passport: 'M5 3h14v18H5zM12 8a3 3 0 1 0 0 6a3 3 0 1 0 0-6zM9 17h6',
    home: 'M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
    user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8z',
    userPlus: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM19 8v6M22 11h-6',
    login: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
    finger: 'M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4M14 13.12c0 2.38 0 6.38-1 8.88M17.29 21.02c.12-.6.43-2.3.5-3.02M2 12a10 10 0 0 1 18-6M2 16h.01M21.8 16c.2-2 .131-5.354 0-6M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2M8.65 22c.21-.66.45-1.32.57-2M9 6.8a6 6 0 0 1 9 5.2v2',
    lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
    back: 'M5 12h14M12 5l7 7-7 7',
    fwd: 'M19 12H5M12 19l-7-7 7-7',
    chev: 'M15 18l-6-6 6-6',
    search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM21 21l-4.3-4.3',
    plus: 'M12 5v14M5 12h14',
    guest: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7v5l3 2'
  };

  var services = [
    { k: 'umrah', n: 'خدمات العمرة', i: 'kaaba', g: 'umrah' },
    { k: 'flight', n: 'تذاكر الطيران', i: 'plane', g: 'travel' },
    { k: 'hotel', n: 'حجز الفنادق', i: 'bed', g: 'travel' },
    { k: 'ferry', n: 'حجز العبارات', i: 'ship', g: 'travel' },
    { k: 'family', n: 'تأشيرة الزيارة العائلية', i: 'users', g: 'visa' },
    { k: 'work', n: 'تأشيرة العمل', i: 'briefcase', g: 'visa' },
    { k: 'intl', n: 'التأشيرات الدولية', i: 'globe', g: 'visa' },
    { k: 'egypt', n: 'الموافقة الأمنية لمصر', i: 'shield', g: 'visa' },
    { k: 'tasheel', n: 'حجز مواعيد تساهيل', i: 'calendar', g: 'appt' }
  ];
  var groups = [
    { k: 'umrah', n: 'العمرة' },
    { k: 'travel', n: 'السفر والإقامة' },
    { k: 'visa', n: 'التأشيرات والموافقات' },
    { k: 'appt', n: 'المواعيد' }
  ];
  var tabs = [
    { k: 'home', n: 'الرئيسية', i: 'home' },
    { k: 'requests', n: 'طلباتي', i: 'list' },
    { k: 'notifications', n: 'الإشعارات', i: 'bell' },
    { k: 'account', n: 'حسابي', i: 'user' }
  ];

  function icon(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + P[name] + '"/></svg>';
  }
  function svc(k) { for (var i = 0; i < services.length; i++) if (services[i].k === k) return services[i]; }
  function inGroup(g) { return services.filter(function (s) { return s.g === g; }); }

  // Mount: each concept passes {welcome, returning, home, services}; hash picks the screen.
  function mount(views) {
    var app = document.getElementById('app');
    function draw() {
      var s = (location.hash || '#welcome').slice(1);
      if (!views[s]) s = 'welcome';
      app.innerHTML = views[s]();
      app.setAttribute('data-screen', s);
      app.scrollTop = 0;
    }
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-go]');
      if (t) { e.preventDefault(); location.hash = t.getAttribute('data-go'); }
    });
    window.addEventListener('hashchange', draw);
    draw();
  }

  window.N = { icon: icon, services: services, groups: groups, tabs: tabs, svc: svc, inGroup: inGroup, mount: mount };
})();
