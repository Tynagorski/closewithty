/* Close With Ty — shared interactions
   Phase 1: form submit + nav toggle. Phase 4 will add scroll-reveal,
   counters, magnetic CTA. Everything respects prefers-reduced-motion. */

(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Mobile nav toggle ────────────────────────────────────────
  const toggle = document.querySelector('[data-nav-toggle]');
  const links  = document.querySelector('[data-nav-links]');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  // ── Formspree submit ─────────────────────────────────────────
  // Usage: <form data-form action="https://formspree.io/f/..." data-success="#id">
  document.querySelectorAll('form[data-form]').forEach(form => {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const successEl = form.querySelector('[data-success]') || document.querySelector(form.dataset.success || '');
      const errorEl   = form.querySelector('[data-error]');
      const original  = btn ? btn.textContent : '';

      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      if (errorEl) errorEl.hidden = true;

      try {
        const res = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' }
        });
        if (res.ok) {
          form.reset();
          if (successEl) successEl.hidden = false;
        } else {
          throw new Error('Form submission failed');
        }
      } catch (err) {
        if (errorEl) {
          errorEl.hidden = false;
          errorEl.textContent = 'Something went wrong. Please call (440) 749-7218 or email tyler@elementmortgage.com.';
        }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = original; }
      }
    });
  });

  // ── AI Sidekick ──────────────────────────────────────────────
  const fab       = document.getElementById('sidekick-fab');
  const panel     = document.getElementById('sidekick-panel');
  const closeBtn  = document.querySelector('[data-sidekick-close]');
  const form      = document.getElementById('sidekick-form');
  const input     = document.getElementById('sidekick-input');
  const msgLog    = document.getElementById('sidekick-messages');

  if (fab && panel) {
    const CALENDLY_URL = 'https://calendly.com/tyler-elementmortgage/30min';
    const CHAT_ENDPOINT = '/.netlify/functions/chat';
    const conversationHistory = [];
    let isWaiting = false;

    const openPanel = () => {
      panel.hidden = false;
      fab.setAttribute('aria-expanded', 'true');
      if (conversationHistory.length === 0) {
        appendMsg('ai', 'Hey! I\'m Ty\'s AI Sidekick. Ask me anything about mortgages, rates, or the loan process — I\'ll give you a straight answer and let you know when it\'s worth getting Tyler on the phone.');
      }
      setTimeout(() => input && input.focus(), 50);
    };

    const closePanel = () => {
      panel.hidden = true;
      fab.setAttribute('aria-expanded', 'false');
    };

    const appendMsg = (role, text) => {
      const el = document.createElement('div');
      el.className = `sidekick-msg ${role}`;
      el.textContent = text;
      msgLog.appendChild(el);
      msgLog.scrollTop = msgLog.scrollHeight;
      return el;
    };

    const removeThinking = () => {
      const thinking = msgLog.querySelector('.thinking');
      if (thinking) thinking.remove();
    };

    fab.addEventListener('click', () => {
      panel.hidden ? openPanel() : closePanel();
    });

    if (closeBtn) closeBtn.addEventListener('click', closePanel);

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isWaiting) return;
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        appendMsg('user', text);
        conversationHistory.push({ role: 'user', content: text });

        isWaiting = true;
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        const thinkingEl = appendMsg('thinking', '···');

        try {
          const res = await fetch(CHAT_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: conversationHistory })
          });

          removeThinking();

          if (!res.ok) throw new Error('API error');

          const { reply } = await res.json();
          conversationHistory.push({ role: 'assistant', content: reply });
          appendMsg('ai', reply);
        } catch {
          removeThinking();
          appendMsg('ai', `Something went wrong on my end. Call Tyler directly at (440) 749-7218 or book a time at ${CALENDLY_URL}`);
        } finally {
          isWaiting = false;
          if (submitBtn) submitBtn.disabled = false;
          input.focus();
        }
      });
    }
  }

  // ── Scroll-reveal (Phase 4 will refine; basic version here) ──
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });

    document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
  } else {
    document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('is-revealed'));
  }

  // ── Mortgage Calculator ──────────────────────────────────────
  (() => {
    const priceInput    = document.getElementById('calc-price');
    const priceSlider   = document.getElementById('calc-price-slider');
    const downInput     = document.getElementById('calc-down');
    const downPctInput  = document.getElementById('calc-down-pct');
    const downSlider    = document.getElementById('calc-down-slider');
    const rateInput     = document.getElementById('calc-rate');
    const taxInput      = document.getElementById('calc-tax');
    const insInput      = document.getElementById('calc-ins');
    const termBtns      = document.querySelectorAll('.calc-term-btn');
    if (!priceInput) return;

    let term = 30;

    const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');

    const calc = () => {
      const price    = parseFloat(priceInput.value)  || 0;
      const down     = parseFloat(downInput.value)   || 0;
      const rate     = parseFloat(rateInput.value)   || 0;
      const taxRate  = parseFloat(taxInput.value)    || 0;
      const annualIns= parseFloat(insInput.value)    || 0;
      const loan     = Math.max(0, price - down);
      const mr       = rate / 100 / 12;
      const n        = term * 12;
      const pi       = mr > 0
        ? loan * mr * Math.pow(1 + mr, n) / (Math.pow(1 + mr, n) - 1)
        : loan / n;
      const taxMo    = price * (taxRate / 100) / 12;
      const insMo    = annualIns / 12;
      const pmiMo    = down / price < 0.2 ? loan * 0.005 / 12 : 0;
      const total    = pi + taxMo + insMo + pmiMo;
      const totalInt = (pi * n) - loan;
      const totalCost= pi * n + taxMo * n + insMo * n;

      document.getElementById('calc-monthly').textContent   = fmt(total);
      document.getElementById('calc-pi').textContent        = fmt(pi);
      document.getElementById('calc-tax-mo').textContent    = fmt(taxMo);
      document.getElementById('calc-ins-mo').textContent    = fmt(insMo);
      document.getElementById('calc-pmi').textContent       = fmt(pmiMo);
      document.getElementById('calc-loan-amt').textContent  = fmt(loan);
      document.getElementById('calc-total-int').textContent = fmt(totalInt);
      document.getElementById('calc-total-cost').textContent= fmt(totalCost);
      document.getElementById('calc-pmi-row').style.opacity = pmiMo > 0 ? '1' : '0.3';

      // Color bar
      const piPct  = (pi  / total * 100).toFixed(1);
      const txPct  = (taxMo / total * 100).toFixed(1);
      const inPct  = (insMo / total * 100).toFixed(1);
      const pmPct  = (pmiMo / total * 100).toFixed(1);
      document.getElementById('calc-bar-pi').style.width  = piPct + '%';
      document.getElementById('calc-bar-tax').style.width = txPct + '%';
      document.getElementById('calc-bar-ins').style.width = inPct + '%';
      document.getElementById('calc-bar-pmi').style.width = pmPct + '%';
    };

    // Sync price slider ↔ input
    priceInput.addEventListener('input', () => {
      priceSlider.value = priceInput.value;
      // keep down pct consistent
      const pct = parseFloat(downPctInput.value) || 0;
      downInput.value = Math.round(parseFloat(priceInput.value) * pct / 100);
      calc();
    });
    priceSlider.addEventListener('input', () => {
      priceInput.value = priceSlider.value;
      const pct = parseFloat(downPctInput.value) || 0;
      downInput.value = Math.round(parseFloat(priceInput.value) * pct / 100);
      calc();
    });

    // Sync down $ ↔ %
    downInput.addEventListener('input', () => {
      const pct = parseFloat(priceInput.value) > 0
        ? (parseFloat(downInput.value) / parseFloat(priceInput.value) * 100).toFixed(1) : 0;
      downPctInput.value = pct;
      downSlider.value   = Math.min(30, Math.round(pct));
      calc();
    });
    downPctInput.addEventListener('input', () => {
      downInput.value = Math.round(parseFloat(priceInput.value) * parseFloat(downPctInput.value) / 100);
      downSlider.value = Math.min(30, parseFloat(downPctInput.value));
      calc();
    });
    downSlider.addEventListener('input', () => {
      downPctInput.value = downSlider.value;
      downInput.value    = Math.round(parseFloat(priceInput.value) * parseFloat(downSlider.value) / 100);
      calc();
    });

    // Rate, tax, ins
    [rateInput, taxInput, insInput].forEach(el => el.addEventListener('input', calc));

    // Term
    termBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        termBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        term = parseInt(btn.dataset.term);
        calc();
      });
    });

    calc(); // initial run
  })();

  // ── Daily Debrief ────────────────────────────────────────────
  (() => {
    const QUOTES = [
      { q: "Real estate cannot be lost or stolen, nor can it be carried away. Purchased with common sense, paid for in full, and managed with reasonable care, it is about the safest investment in the world.", a: "Franklin D. Roosevelt" },
      { q: "The best time to buy a home is always five years ago.", a: "Ray Brown" },
      { q: "Don't wait to buy real estate. Buy real estate and wait.", a: "Will Rogers" },
      { q: "Ninety percent of all millionaires become so through owning real estate.", a: "Andrew Carnegie" },
      { q: "The problem with real estate is that it's local. You have to understand the local market.", a: "Robert Kiyosaki" },
      { q: "Buy land, they're not making it anymore.", a: "Mark Twain" },
      { q: "Every person who invests in well-selected real estate in a growing section of a prosperous community adopts the surest and safest method of becoming independent.", a: "Theodore Roosevelt" },
      { q: "It's not about how much money you make, but how much money you keep, how hard it works for you, and how many generations you keep it for.", a: "Robert Kiyosaki" },
      { q: "Real estate is an imperishable asset, ever increasing in value. It is the most solid security that human ingenuity has devised.", a: "Russell Sage" },
      { q: "Landlords grow rich in their sleep without working, risking, or economizing.", a: "John Stuart Mill" },
      { q: "A man is not a whole and complete man unless he owns a house and the ground it stands on.", a: "Walt Whitman" },
      { q: "In the real estate business you earn a living by the sweat of your brow.", a: "Conrad Hilton" },
      { q: "The best investment on earth is earth.", a: "Louis Glickman" },
      { q: "Owning a home is a keystone of wealth — both financial affluence and emotional security.", a: "Suze Orman" },
      { q: "To be successful in real estate, you must always and consistently put your clients' best interests first.", a: "Anthony Hitt" },
      { q: "Real estate investing, even on a very small scale, remains a tried and true means of building an individual's cash flow and wealth.", a: "Robert Kiyosaki" },
      { q: "Buying real estate is not only the best way, the quickest way, the safest way, but the only way to become wealthy.", a: "Marshall Field" },
      { q: "The wise young man or wage earner will invest his money in real estate.", a: "Andrew Carnegie" },
      { q: "In real estate, you make 10% of your money because you're a genius and 90% because you catch a great wave.", a: "Jeff Greene" },
      { q: "If you don't own a home, buy one. If you own a home, buy another one. If you own two homes, buy a third.", a: "John Paulson" },
      { q: "Success in real estate starts when you believe you are worthy of it.", a: "Michael Ferrara" },
      { q: "The most valuable real estate in the world is between your client's ears.", a: "Unknown" },
      { q: "Find out where the people are going and buy the land before they get there.", a: "William Penn Adair Rogers" },
      { q: "A great mortgage is the bridge between where a client is today and where they want to be tomorrow.", a: "Tyler Nagorski" },
      { q: "Every borrower deserves a plan, not a denial.", a: "Close With Ty" },
      { q: "Opportunities in real estate are like buses — there's always another one coming.", a: "Richard Branson" },
      { q: "The major fortunes in America have been made in land.", a: "John D. Rockefeller" },
      { q: "He is not a full man who does not own a piece of land.", a: "Hebrew Proverb" },
      { q: "I made a tremendous amount of money on real estate. I'll take real estate rather than go to Wall Street.", a: "Ivana Trump" },
      { q: "It's tangible, it's solid, it's beautiful. It's artistic, from my standpoint, and I just love real estate.", a: "Donald Trump" }
    ];

    const quoteEl  = document.getElementById('debrief-quote');
    const authorEl = document.getElementById('debrief-author');
    const newsEl   = document.getElementById('debrief-news');
    const r30El    = document.getElementById('rate-30');
    const r15El    = document.getElementById('rate-15');
    if (!quoteEl) return;

    // Daily quote (changes daily, deterministic)
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const { q, a } = QUOTES[dayOfYear % QUOTES.length];
    quoteEl.textContent  = `"${q}"`;
    authorEl.textContent = `— ${a}`;

    // Rates + news from Netlify function
    fetch('/.netlify/functions/debrief')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        if (data.rate30) r30El.textContent = data.rate30 + '%';
        if (data.rate15) r15El.textContent = data.rate15 + '%';
        if (data.news && data.news.length) {
          newsEl.innerHTML = data.news.map(item =>
            `<li><a href="${item.link}" target="_blank" rel="noopener noreferrer">${item.title}</a>
              <span class="news-source">${item.source} · ${item.date}</span>
            </li>`
          ).join('');
        }
      })
      .catch(() => {
        // Rates fail silently; contact CTA is shown in the rate card
        r30El.textContent = 'Call for rate';
        r15El.textContent = 'Call for rate';
        newsEl.innerHTML = '<li>News temporarily unavailable — check back shortly.</li>';
      });
  })();

})();
