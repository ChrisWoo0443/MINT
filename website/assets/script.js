/* MINT website — minimal interactions */

(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Scroll reveal */
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length && 'IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }

  /* Copy buttons */
  document.querySelectorAll('.copy[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.getAttribute('data-copy') || '';
      const original = btn.textContent;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied';
      } catch {
        btn.textContent = 'Press ⌘C';
      }
      setTimeout(() => {
        btn.textContent = original || 'Copy';
      }, 1400);
    });
  });

  /* Docs scroll-spy */
  const sidebarLinks = document.querySelectorAll('.docs-sidebar a[href^="#"]');
  const sections = document.querySelectorAll('.docs-content section[id]');
  if (sidebarLinks.length && sections.length && 'IntersectionObserver' in window) {
    const linkMap = new Map();
    sidebarLinks.forEach((a) => {
      const id = (a.getAttribute('href') || '').slice(1);
      if (id) linkMap.set(id, a);
    });
    const setActive = (id) => {
      sidebarLinks.forEach((a) => a.classList.remove('active'));
      const link = linkMap.get(id);
      if (link) link.classList.add('active');
    };
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 }
    );
    sections.forEach((s) => spy.observe(s));
  }
})();
