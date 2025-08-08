(()=>{
  const root = document.getElementById('root');
  const notificationEl = document.getElementById('notification');
  const socket = io({ path: '/socket.io' });

  function executeScripts(container){
    const scripts = container.querySelectorAll('script');
    scripts.forEach(oldScript => {
      const newScript = document.createElement('script');
      // copy attributes
      for (const { name, value } of Array.from(oldScript.attributes)) newScript.setAttribute(name, value);
      newScript.text = oldScript.textContent;
      oldScript.replaceWith(newScript);
    });
  }

  function setContent(html){
    root.innerHTML = html;
    executeScripts(root);
  }
  function showNotification(data){
    notificationEl.textContent = data.message;
    notificationEl.dataset.level = data.level || 'info';
    notificationEl.className = '';
    notificationEl.classList.add(data.level || 'info');
    if (data.duration) {
      setTimeout(()=>{
        notificationEl.classList.add('hidden');
      }, data.duration);
    }
  }
  socket.on('connect', ()=>{
    console.log('[hdisplay] connected');
  });
  socket.on('content:update', payload => {
    setContent(payload.content || '');
    if (payload.template) {
      document.title = `hdisplay - ${payload.template.id}`;
    }
  });
  socket.on('notification', payload => {
    showNotification(payload);
  });
  socket.on('notification:clear', ()=>{
    notificationEl.classList.add('hidden');
  });
})();
