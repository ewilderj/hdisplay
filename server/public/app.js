(() => {
  const root = document.getElementById('root');
  const notificationEl = document.getElementById('notification');
  // Expose helpers asap (before connecting socket)
  function afterFontsReady(cb) {
    const run = () => requestAnimationFrame(cb);
    try {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(run, run);
      } else {
        run();
      }
    } catch {
      run();
    }
  }
  window.hdisplay = window.hdisplay || {};
  window.hdisplay.afterFontsReady = afterFontsReady;
  window.hdisplay.hiddenUntilReady = function (el, initFn) {
    if (!el) return;
    try {
      el.style.visibility = 'hidden';
    } catch {}
    requestAnimationFrame(() => {
      try {
        if (typeof initFn === 'function') initFn();
      } catch {}
      requestAnimationFrame(() => {
        try {
          el.style.visibility = 'visible';
        } catch {}
      });
    });
  };

  const socket = io({ path: '/socket.io' });

  function executeScripts(container) {
    const scripts = container.querySelectorAll('script');
    scripts.forEach((oldScript) => {
      const newScript = document.createElement('script');
      // copy attributes
      for (const { name, value } of Array.from(oldScript.attributes))
        newScript.setAttribute(name, value);
      newScript.text = oldScript.textContent;
      oldScript.replaceWith(newScript);
    });
  }

  // Crossfade: use two layers and swap
  let a = document.createElement('div');
  let b = document.createElement('div');
  a.className = 'layer visible';
  b.className = 'layer';
  root.appendChild(a);
  root.appendChild(b);
  let contentVersion = 0;

  // (helper defined above)

  function setContent(html) {
    const incoming = a.classList.contains('visible') ? b : a;
    const outgoing = a.classList.contains('visible') ? a : b;
    const myVersion = ++contentVersion;
    // Prepare incoming at opacity 0
    incoming.classList.remove('visible');
    incoming.innerHTML = html;
    // Force style flush to ensure transition from 0 -> 1
    void incoming.offsetWidth; // reflow
    // Defer class changes to next frame for reliable transition
    requestAnimationFrame(() => {
      if (myVersion !== contentVersion) return; // stale
      // Ensure incoming appears before outgoing in DOM so generic selectors hit it first
      if (incoming.parentElement === root && root.firstChild !== incoming) {
        root.insertBefore(incoming, root.firstChild);
      }
      incoming.classList.add('visible');
      outgoing.classList.remove('visible');
      // Execute scripts for incoming now that it's visible; templates can defer visibility via helper
      if (myVersion === contentVersion) executeScripts(incoming);
      // Clear outgoing after transition to free memory
      setTimeout(() => {
        if (myVersion !== contentVersion) return;
        if (!outgoing.classList.contains('visible')) {
          outgoing.innerHTML = '';
        }
      }, 520);
    });
  }
  function showNotification(data) {
    notificationEl.textContent = data.message;
    notificationEl.dataset.level = data.level || 'info';
    notificationEl.className = '';
    notificationEl.classList.add(data.level || 'info');
    if (data.duration) {
      setTimeout(() => {
        notificationEl.classList.add('hidden');
      }, data.duration);
    }
  }
  socket.on('connect', () => {
    console.log('[hdisplay] connected');
  });
  socket.on('content:update', (payload) => {
    setContent(payload.content || '');
    if (payload.template) {
      document.title = `hdisplay - ${payload.template.id}`;
    }
  });
  socket.on('notification', (payload) => {
    showNotification(payload);
  });
  socket.on('notification:clear', () => {
    notificationEl.classList.add('hidden');
  });
})();
