/* Safe Ocean – studio a e-shop. Vanilla JS, bez knihoven. */
(function () {
  'use strict';
  var d = document;
  var $ = function (s, r) { return (r || d).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  var base = d.body.getAttribute('data-base') || '/';
  var kc = function (n) { return Math.round(n).toLocaleString('cs-CZ').replace(/\s/g, ' ') + ' Kč'; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var tvar = function (n, a, b, c) { return n === 1 ? a : (n >= 2 && n <= 4 ? b : c); };

  /* úvodní roztočení rejnoků (jen 1× za návštěvu, CSS ho schová i bez JS) */
  var rej = $('[data-rejnoci]');
  if (rej) {
    var pryc = function () { if (rej.parentNode) rej.parentNode.removeChild(rej); };
    if (d.documentElement.classList.contains('bez-uvodu')) pryc();
    else { rej.addEventListener('animationend', function (e) { if (e.target === rej) pryc(); }); setTimeout(pryc, 3200); }
  }

  /* rozmazaný náhled fotky pryč, jakmile je fotka načtená (kvůli průhledným a „contain“ fotkám) */
  var lqPryc = function (im) { im.style.backgroundImage = 'none'; im.removeAttribute('data-lq'); };
  Array.prototype.forEach.call(d.querySelectorAll('img[data-lq]'), function (im) {
    if (im.complete && im.naturalWidth) lqPryc(im);
    else im.addEventListener('load', function () { lqPryc(im); }, { once: true });
  });

  /* úvod s videem: hlavička plná po posunu, video jen když je vidět */
  var hlU = d.body.classList.contains('tmavy--uvod') ? $('[data-hlavicka]') : null;
  if (hlU) {
    var plna = function () { hlU.classList.toggle('je-plna', window.scrollY > 40); };
    plna(); window.addEventListener('scroll', plna, { passive: true });
  }
  var vid = $('[data-hero-video]');
  if (vid) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { vid.removeAttribute('autoplay'); vid.pause(); }
    else if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (z) { z.forEach(function (e) { if (e.isIntersecting) { var p = vid.play(); if (p && p.catch) p.catch(function () {}); } else vid.pause(); }); }).observe(vid);
    }
  }

  /* výška hlavičky pro sticky prvky */
  var hl = $('[data-hlavicka]');
  var vyskaHl = function () { if (hl) d.documentElement.style.setProperty('--hl', hl.offsetHeight + 'px'); };
  vyskaHl();
  window.addEventListener('resize', vyskaHl);

  /* mobilní menu */
  var burger = $('.burger'), mob = $('#mobmenu');
  if (burger && mob) {
    burger.addEventListener('click', function () {
      var otevrit = burger.getAttribute('aria-expanded') !== 'true';
      burger.setAttribute('aria-expanded', otevrit);
      mob.hidden = !otevrit;
      vyskaHl();
    });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !mob.hidden) { mob.hidden = true; burger.setAttribute('aria-expanded', 'false'); burger.focus(); }
    });
  }

  /* záložky */
  $$('[role="tablist"]').forEach(function (list) {
    var tabs = $$('[role="tab"]', list);
    var vyber = function (t, fokus) {
      tabs.forEach(function (x) {
        var ano = x === t;
        x.setAttribute('aria-selected', ano);
        x.tabIndex = ano ? 0 : -1;
        var p = d.getElementById(x.getAttribute('aria-controls'));
        if (p) p.hidden = !ano;
      });
      if (fokus) t.focus();
    };
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { vyber(t); });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') vyber(tabs[(i + 1) % tabs.length], true);
        if (e.key === 'ArrowLeft') vyber(tabs[(i - 1 + tabs.length) % tabs.length], true);
      });
    });
  });

  /* ── košík ── */
  var KLIC = 'safeocean-kosik';
  var kosik = (function () {
    try { var k = JSON.parse(localStorage.getItem(KLIC) || '[]'); return Array.isArray(k) ? k : []; } catch (e) { return []; }
  })();
  var uloz = function () {
    try { localStorage.setItem(KLIC, JSON.stringify(kosik)); } catch (e) { /* bez úložiště košík žije jen do obnovení stránky */ }
    pocet();
  };
  var pocet = function (puls) {
    var n = kosik.reduce(function (s, p) { return s + p.pocet; }, 0);
    $$('[data-kosik-pocet]').forEach(function (b) {
      b.textContent = n;
      b.hidden = n === 0;
      if (puls) { b.classList.remove('je-pridano'); void b.offsetWidth; b.classList.add('je-pridano'); }
    });
  };
  pocet();

  var toast = $('[data-toast]'), toastCas;
  var ukazToast = function (html) {
    if (!toast) return;
    toast.innerHTML = html;
    toast.hidden = false;
    clearTimeout(toastCas);
    toastCas = setTimeout(function () { toast.hidden = true; }, 4200);
  };

  var pridej = function (p, n) {
    n = Math.max(1, Math.min(50, n || 1));
    var x = kosik.filter(function (k) { return k.slug === p.slug && k.varianta === p.varianta; })[0];
    if (x) x.pocet = Math.min(50, x.pocet + n);
    else kosik.push({ slug: p.slug, nazev: p.nazev, varianta: p.varianta || '', cena: +p.cena, foto: p.foto, packshot: !!p.packshot, ziva: !!p.ziva, mrazene: !!p.mrazene, url: p.url, pocet: n });
    uloz();
    pocet(true);
    ukazToast('<span>Přidáno do košíku: ' + esc(p.nazev) + (p.varianta ? ' (' + esc(p.varianta) + ')' : '') + '</span><a href="' + base + 'eshop/kosik/">Košík</a>');
  };

  d.addEventListener('click', function (e) {
    var b = e.target.closest('[data-pridat]');
    if (!b) return;
    e.preventDefault();
    try { pridej(JSON.parse(b.getAttribute('data-pridat')), 1); } catch (er) { return; }
    b.classList.add('je-ok');
    setTimeout(function () { b.classList.remove('je-ok'); }, 1200);
  });

  /* ── detail produktu ── */
  var nakup = $('[data-nakup]');
  if (nakup) {
    var zaklad = JSON.parse(nakup.getAttribute('data-nakup'));
    var vstup = $('input[name="pocet"]', nakup), cenaEl = $('[data-cena-zobraz]', nakup);
    var omez = function () { vstup.value = Math.max(1, Math.min(50, parseInt(vstup.value, 10) || 1)); };
    $('[data-minus]', nakup).addEventListener('click', function () { vstup.value = (parseInt(vstup.value, 10) || 1) - 1; omez(); });
    $('[data-plus]', nakup).addEventListener('click', function () { vstup.value = (parseInt(vstup.value, 10) || 1) + 1; omez(); });
    vstup.addEventListener('change', omez);
    $$('input[name="varianta"]', nakup).forEach(function (r) {
      r.addEventListener('change', function () {
        cenaEl.textContent = kc(+r.getAttribute('data-cena'));
        var ph = $('[data-poukaz-hodnota]');
        if (ph) ph.textContent = kc(+r.getAttribute('data-cena'));
      });
    });
    nakup.addEventListener('submit', function (e) {
      e.preventDefault();
      omez();
      var p = Object.assign({}, zaklad), v = $('input[name="varianta"]:checked', nakup);
      if (v) { p.varianta = v.getAttribute('data-nazev'); p.cena = +v.getAttribute('data-cena'); }
      pridej(p, parseInt(vstup.value, 10));
    });
  }
  var gal = $('[data-galerie]');
  if (gal) {
    var hlavni = $('.galerie__hlavni img', gal);
    $$('.galerie__nahledy button', gal).forEach(function (b) {
      b.addEventListener('click', function () {
        hlavni.removeAttribute('srcset');
        hlavni.src = b.getAttribute('data-src');
        $$('.galerie__nahledy button', gal).forEach(function (x) { x.setAttribute('aria-current', x === b); });
      });
    });
  }

  /* ── výpis obchodu: filtry, řazení, hledání ── */
  var obchod = $('[data-obchod]');
  if (obchod) {
    var mriz = $('[data-mrizka]', obchod), karty = $$('[data-karta]', mriz);
    var pocetEl = $('[data-pocet]', obchod), prazdne = $('[data-prazdne]', obchod);
    var info = $('[data-hledani-info]', obchod);
    var stav = { podkat: '', ziva: false, ceny: [], znacky: [], q: '' };
    try { stav.q = (new URLSearchParams(location.search).get('q') || '').trim().toLowerCase(); } catch (e) { /* starý prohlížeč */ }
    if (stav.q) $$('input[name="q"]').forEach(function (i) { i.value = stav.q; });

    var filtruj = function () {
      var n = 0;
      karty.forEach(function (k) {
        var cena = +k.getAttribute('data-cena');
        var ok = (!stav.podkat || k.getAttribute('data-podkat') === stav.podkat) &&
          (!stav.ziva || k.getAttribute('data-ziva') === '1') &&
          (!stav.znacky.length || stav.znacky.indexOf(k.getAttribute('data-znacka')) > -1) &&
          (!stav.ceny.length || stav.ceny.some(function (r) { return cena >= r[0] && cena < r[1]; })) &&
          (!stav.q || stav.q.split(/\s+/).every(function (s) { return k.getAttribute('data-hledat').indexOf(s) > -1; }));
        k.hidden = !ok;
        if (ok) n++;
      });
      pocetEl.textContent = n + ' ' + tvar(n, 'produkt', 'produkty', 'produktů');
      prazdne.hidden = n > 0;
      if (info) {
        info.hidden = !stav.q;
        if (stav.q) $('span', info).textContent = 'Hledání „' + stav.q + '“: ' + n + ' ' + tvar(n, 'výsledek', 'výsledky', 'výsledků');
      }
    };
    $$('[data-podkat]', obchod).forEach(function (b) {
      b.addEventListener('click', function () {
        stav.podkat = b.getAttribute('data-podkat');
        $$('[data-podkat]', obchod).forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
        filtruj();
      });
    });
    var zivaCb = $('[data-f-ziva]', obchod);
    if (zivaCb) zivaCb.addEventListener('change', function () { stav.ziva = zivaCb.checked; filtruj(); });
    var cenaCb = $$('[data-f-cena]', obchod), znCb = $$('[data-f-znacka]', obchod);
    cenaCb.forEach(function (c) { c.addEventListener('change', function () {
      stav.ceny = cenaCb.filter(function (x) { return x.checked; }).map(function (x) { return x.getAttribute('data-f-cena').split('-').map(Number); });
      filtruj();
    }); });
    znCb.forEach(function (c) { c.addEventListener('change', function () {
      stav.znacky = znCb.filter(function (x) { return x.checked; }).map(function (x) { return x.getAttribute('data-f-znacka'); });
      filtruj();
    }); });
    var zrus = $('[data-hledani-zrusit]', obchod);
    if (zrus) zrus.addEventListener('click', function () {
      stav.q = '';
      $$('input[name="q"]').forEach(function (i) { i.value = ''; });
      try { history.replaceState(null, '', location.pathname); } catch (e) { /* nic */ }
      filtruj();
    });
    $('[data-razeni]', obchod).addEventListener('change', function (e) {
      var v = e.target.value, srovnej = {
        'doporucene': function (a, b) { return a.getAttribute('data-poradi') - b.getAttribute('data-poradi'); },
        'cena-vzestupne': function (a, b) { return a.getAttribute('data-cena') - b.getAttribute('data-cena'); },
        'cena-sestupne': function (a, b) { return b.getAttribute('data-cena') - a.getAttribute('data-cena'); },
        'nazev': function (a, b) { return $('.karta__nazev', a).textContent.localeCompare($('.karta__nazev', b).textContent, 'cs'); }
      }[v];
      karty.slice().sort(srovnej).forEach(function (k) { mriz.appendChild(k); });
    });
    /* panel filtrů na mobilu */
    var panel = $('#filtry'), zaclona = $('[data-zaclona]', obchod), otevrit = $('[data-filtry-otevrit]', obchod);
    var panelUkaz = function (ano) {
      panel.classList.toggle('je-otevrene', ano);
      zaclona.hidden = !ano;
      otevrit.setAttribute('aria-expanded', ano);
      if (ano) $('button, a, input', panel).focus(); else otevrit.focus();
    };
    otevrit.addEventListener('click', function () { panelUkaz(true); });
    zaclona.addEventListener('click', function () { panelUkaz(false); });
    $('[data-filtry-zavrit]', obchod).addEventListener('click', function () { panelUkaz(false); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('je-otevrene')) panelUkaz(false); });
    filtruj();
  }

  /* ── košík a pokladna ── */
  var kos = $('[data-kosik]');
  if (kos) {
    var dopravy = JSON.parse(kos.getAttribute('data-dopravy')), platby = JSON.parse(kos.getAttribute('data-platby'));
    var obsah = $('[data-kosik-obsah]', kos), prazdny = $('[data-kosik-prazdny]', kos), seznam = $('[data-kosik-seznam]', kos);
    var zivaPozn = $('[data-ziva-pozn]', kos), adresa = $('[data-adresa]', kos), chyba = $('[data-chyba]', kos);
    var hotovo = $('[data-hotovo]', kos);

    var vykresli = function () {
      prazdny.hidden = kosik.length > 0;
      obsah.hidden = kosik.length === 0;
      seznam.innerHTML = kosik.map(function (p, i) {
        return '<li class="polozka" data-i="' + i + '">' +
          '<a class="polozka__foto' + (p.packshot ? ' polozka__foto--packshot' : '') + '" href="' + esc(p.url) + '" tabindex="-1" aria-hidden="true">' + (p.foto ? '<img src="' + esc(p.foto) + '" alt="" width="88" height="88" loading="lazy">' : '') + '</a>' +
          '<div class="polozka__text"><a class="polozka__nazev" href="' + esc(p.url) + '">' + esc(p.nazev) + '</a>' +
          '<span class="polozka__var">' + [p.varianta, p.ziva ? 'živé zboží' : '', p.mrazene ? 'mražené' : ''].filter(Boolean).map(esc).join(' · ') + '</span></div>' +
          '<div class="mnozstvi"><button type="button" data-zmena="-1" aria-label="Méně">−</button><input type="number" min="1" max="50" value="' + p.pocet + '" aria-label="Počet kusů" data-pocet-i><button type="button" data-zmena="1" aria-label="Více">+</button></div>' +
          '<span class="polozka__cena">' + kc(p.cena * p.pocet) + '</span>' +
          '<button type="button" class="polozka__odebrat" data-odebrat aria-label="Odebrat ' + esc(p.nazev) + '">×</button></li>';
      }).join('');
      prepocitej();
    };
    var prepocitej = function () {
      var omezeni = kosik.some(function (p) { return p.ziva || p.mrazene; });
      zivaPozn.hidden = !omezeni;
      $$('[data-doprava]', kos).forEach(function (l) {
        var dd = dopravy.filter(function (x) { return x.id === l.getAttribute('data-doprava'); })[0];
        var zakaz = omezeni && !dd.zive, inp = $('input', l);
        inp.disabled = zakaz;
        l.classList.toggle('je-zakazana', zakaz);
        if (zakaz && inp.checked) { inp.checked = false; $('input[value="osobni"]', kos).checked = true; }
      });
      var dop = $('input[name="doprava"]:checked', kos).value;
      $$('[data-platba]', kos).forEach(function (l) {
        var pp = platby.filter(function (x) { return x.id === l.getAttribute('data-platba'); })[0];
        var zakaz = pp.jen_osobni && dop !== 'osobni', inp = $('input', l);
        inp.disabled = zakaz;
        l.classList.toggle('je-zakazana', zakaz);
        if (zakaz && inp.checked) { inp.checked = false; $('input[value="prevod"]', kos).checked = true; }
      });
      adresa.hidden = !(dop === 'rozvoz' || dop === 'ppl');
      $('input', adresa).required = !adresa.hidden;
      var zbozi = kosik.reduce(function (s, p) { return s + p.cena * p.pocet; }, 0);
      var dc = (dopravy.filter(function (x) { return x.id === dop; })[0] || {}).cena || 0;
      $('[data-s="zbozi"]', kos).textContent = kc(zbozi);
      $('[data-s="doprava"]', kos).textContent = dc ? kc(dc) : 'zdarma';
      $('[data-s="celkem"]', kos).textContent = kc(zbozi + dc);
    };
    seznam.addEventListener('click', function (e) {
      var li = e.target.closest('.polozka'); if (!li) return;
      var i = +li.getAttribute('data-i');
      if (e.target.closest('[data-odebrat]')) kosik.splice(i, 1);
      else if (e.target.closest('[data-zmena]')) kosik[i].pocet = Math.max(1, Math.min(50, kosik[i].pocet + +e.target.closest('[data-zmena]').getAttribute('data-zmena')));
      else return;
      uloz(); vykresli();
    });
    seznam.addEventListener('change', function (e) {
      if (!e.target.matches('[data-pocet-i]')) return;
      var i = +e.target.closest('.polozka').getAttribute('data-i');
      kosik[i].pocet = Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 1));
      uloz(); vykresli();
    });
    obsah.addEventListener('change', function (e) { if (e.target.name === 'doprava' || e.target.name === 'platba') prepocitej(); });
    obsah.addEventListener('submit', function (e) {
      e.preventDefault();
      var spatne = $$('input[required]', obsah).filter(function (i) { return !i.checkValidity(); });
      if (spatne.length) {
        chyba.textContent = 'Vyplňte prosím jméno, telefon, e-mail' + (adresa.hidden ? '' : ' a adresu doručení') + '.';
        spatne[0].focus();
        return;
      }
      chyba.textContent = '';
      var cislo = 'SO' + String(Date.now()).slice(-6);
      var dop = $('input[name="doprava"]:checked', kos).value;
      $('[data-hotovo-text]', kos).textContent = 'Číslo objednávky ' + cislo + '. Potvrzení a ' +
        ($('input[name="platba"]:checked', kos).value === 'prevod' ? 'platební údaje s QR kódem ' : 'další informace ') +
        'pošleme na ' + $('input[name="email"]', obsah).value + '. ' + (dop === 'osobni' || dop === 'rozvoz' ? 'Termín předání domluvíme telefonicky.' : '');
      kosik = []; uloz();
      obsah.hidden = true; prazdny.hidden = true; hotovo.hidden = false;
      hotovo.focus();
      window.scrollTo(0, 0);
    });
    vykresli();
  }

  /* ── poptávkový formulář ── */
  $$('[data-formular]').forEach(function (f) {
    var stavEl = $('.formular-stav', f);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var endpoint = f.getAttribute('data-endpoint');
      if (f.getAttribute('data-demo') === '1' || !endpoint) {
        stavEl.textContent = 'Děkujeme, poptávka je odeslaná. Ozveme se co nejdřív. (V návrhu webu se formulář nikam neodesílá.)';
        f.reset();
        return;
      }
      fetch(endpoint, { method: 'POST', body: new FormData(f), headers: { Accept: 'application/json' } })
        .then(function (r) { if (!r.ok) throw 0; stavEl.textContent = 'Děkujeme, poptávka je odeslaná. Ozveme se co nejdřív.'; f.reset(); })
        .catch(function () { stavEl.textContent = 'Odeslání se nepovedlo. Zavolejte nám prosím nebo napište e-mail.'; });
    });
  });

  /* ── kalkulačka objemu a zátěže ── */
  var kalk = $('[data-kalk]');
  if (kalk) {
    var svg = $('[data-nakres]', kalk);
    var hodnota = function (k) { return +$('[data-k="' + k + '"]', kalk).value; };
    var NS = 'http://www.w3.org/2000/svg';
    var el = function (tag, a, text) {
      var n = d.createElementNS(NS, tag);
      for (var k in a) n.setAttribute(k, a[k]);
      if (text) n.textContent = text;
      svg.appendChild(n);
    };
    var spocitej = function () {
      var D = hodnota('d'), H = hodnota('h'), V = hodnota('v');
      var morske = $('input[name="k-typ"]:checked', kalk).value === 'morske';
      ['d', 'h', 'v'].forEach(function (k) { $('[data-out="' + k + '"]', kalk).textContent = hodnota(k) + ' cm'; });
      var litru = D * H * V / 1000;
      var hustota = morske ? 1.025 : 1;
      var voda = litru * 0.9 * hustota + (morske ? litru * 0.12 * hustota : 0);   // + sump u mořského
      var tl = V <= 40 ? 10 : V <= 50 ? 12 : V <= 60 ? 15 : V <= 70 ? 19 : 25;      // sklo v mm podle výšky
      var sklo = (2 * D * V + 2 * H * V + D * H) / 10000 * tl * 2.5;
      var dekorace = litru * (morske ? 0.12 : 0.08);
      var skrin = 40 + litru * 0.04;
      var kg = voda + sklo + dekorace + skrin;
      var m2 = kg / (D * H / 10000);
      var f = function (n) { return Math.round(n).toLocaleString('cs-CZ').replace(/\s/g, ' '); };
      $('[data-r="l"]', kalk).textContent = f(litru) + ' l';
      $('[data-r="kg"]', kalk).textContent = f(kg) + ' kg';
      $('[data-r="m2"]', kalk).textContent = f(m2) + ' kg/m²';
      $('[data-r="pozn"]', kalk).textContent = m2 > 200
        ? 'Podlahy v bytech se obvykle navrhují na užitné zatížení 150–200 kg/m². Takové akvárium potřebuje posouzení statika a roznášecí konstrukci – obojí řešíme v rámci návrhu.'
        : 'Zátěž je blízko běžné nosnosti podlah v bytech (150–200 kg/m²). I tak ji při návrhu ověříme.';
      /* nákres: zepředu a z boku */
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var s = Math.min(290 / (D + H), 150 / V);
      var w = D * s, h = V * s, hb = H * s, hladina = h * 0.1;
      var x0 = Math.max(10, (400 - (w + 24 + hb + 46)) / 2), y0 = (200 - (h + 20)) / 2 + h;
      el('rect', { x: x0, y: y0 - h, width: w, height: h, fill: '#EEEDFF', stroke: '#0C0A2E', 'stroke-width': 1.5 });
      el('rect', { x: x0 + 1, y: y0 - h + hladina, width: w - 2, height: h - hladina - 1, fill: morske ? '#BFD4FF' : '#CBE8D6' });
      el('rect', { x: x0 + w + 24, y: y0 - h, width: hb, height: h, fill: '#EEEDFF', stroke: '#0C0A2E', 'stroke-width': 1.5 });
      el('rect', { x: x0 + w + 25, y: y0 - h + hladina, width: hb - 2, height: h - hladina - 1, fill: morske ? '#BFD4FF' : '#CBE8D6' });
      el('text', { x: x0 + w / 2, y: y0 + 18, 'text-anchor': 'middle', 'font-size': 12, fill: '#6A6B82' }, D + ' cm');
      el('text', { x: x0 + w + 24 + hb / 2, y: y0 + 18, 'text-anchor': 'middle', 'font-size': 12, fill: '#6A6B82' }, H + ' cm');
      el('text', { x: x0 + w + 30 + hb, y: y0 - h / 2 + 4, 'font-size': 12, fill: '#6A6B82' }, V + ' cm');
    };
    $$('input', kalk).forEach(function (i) { i.addEventListener('input', spocitej); });
    $('[data-kalk-poslat]', kalk).addEventListener('click', function () {
      var zprava = d.getElementById('poptavka-zprava');
      var typ = $('input[name="k-typ"]:checked', kalk).value === 'morske' ? 'mořské' : 'sladkovodní';
      if (zprava) zprava.value = 'Dobrý den, zvažujeme ' + typ + ' akvárium přibližně ' + hodnota('d') + ' × ' + hodnota('h') + ' × ' + hodnota('v') + ' cm (délka × hloubka × výška). Umístění: ';
      var f = d.getElementById('poptavka');
      if (f) { f.scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(function () { zprava.focus({ preventScroll: true }); }, 500); }
    });
    spocitej();
  }

  /* Co stavíme: najetí / fokus přepne fotku přes celou obrazovku */
  var svety = $('[data-svety]');
  if (svety) {
    var sv = $$('[data-svet]', svety);
    var aktivuj = function (li) { sv.forEach(function (x) { x.classList.toggle('je-aktivni', x === li); }); };
    sv.forEach(function (li) {
      var a = $('a', li);
      li.addEventListener('mouseenter', function () { aktivuj(li); });
      a.addEventListener('focus', function () { aktivuj(li); });
    });
  }

  /* Na míru: body na fotce (klik / klávesnice) */
  $$('.body4 li').forEach(function (li, i, vse) {
    var b = $('button', li);
    b.addEventListener('click', function () {
      var otevrit = !li.classList.contains('je-otevreny');
      vse.forEach(function (x) { x.classList.remove('je-otevreny'); $('button', x).setAttribute('aria-expanded', 'false'); });
      if (otevrit) { li.classList.add('je-otevreny'); b.setAttribute('aria-expanded', 'true'); }
    });
  });

  /* Jak to probíhá: záložky jako cesta (klik, šipky) */
  var cesta = $('[data-cesta]');
  if (cesta) {
    var tabs = $$('[role="tab"]', cesta);
    var vyber = function (t, fokus) {
      tabs.forEach(function (x) {
        var on = x === t;
        x.setAttribute('aria-selected', on ? 'true' : 'false');
        x.tabIndex = on ? 0 : -1;
        d.getElementById(x.getAttribute('aria-controls')).hidden = !on;
      });
      if (fokus) t.focus();
    };
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { vyber(t); });
      t.addEventListener('keydown', function (e) {
        var k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (k) { e.preventDefault(); vyber(tabs[(i + k + tabs.length) % tabs.length], true); }
      });
    });
  }

  /* e-shop: nádrže světů – aktivní se rozšíří */
  var nadrze = document.querySelectorAll('[data-nadrz-p]');
  if (nadrze.length) {
    var aktivujN = function (el) {
      nadrze.forEach(function (n) { n.classList.toggle('je-aktivni', n === el); });
    };
    var siroke = window.matchMedia('(min-width: 900px)');
    nadrze.forEach(function (n) {
      n.addEventListener('mouseenter', function () { if (siroke.matches) aktivujN(n); });
      n.addEventListener('focusin', function () { aktivujN(n); });
      n.addEventListener('click', function (e) {
        if (siroke.matches && !n.classList.contains('je-aktivni')) { e.preventDefault(); aktivujN(n); }
      });
    });
  }
})();
