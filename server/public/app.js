(()=>{
  const root = document.getElementById('root');
  const notificationEl = document.getElementById('notification');
  const socket = io({ path: '/socket.io' });

  function setContent(html){
    root.innerHTML = html;
  }
  function showNotification(data){
    notificationEl.textContent = data.message;
    notificationEl.dataset.level = data.level || 'info';
    notificationEl.className = ''; // reset
    notificationEl.classList.add(data.level || 'info');
    notificationEl.classList.remove('hidden');
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
