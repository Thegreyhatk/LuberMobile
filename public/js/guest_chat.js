// guest_chat.js

(() => {
    // 1) Agregar widget al DOM
    const widget = document.createElement('div');
    widget.id = 'guest-chat-widget';
    widget.innerHTML = `
      <div id="guest-chat-header">💬 Chat con Luber</div>
      <div id="guest-chat-body"></div>
      <form id="guest-chat-form">
        <input type="text" id="guest-chat-input" placeholder="Escribe aquí…" required />
        <button type="submit">Enviar</button>
      </form>
    `;
    document.body.appendChild(widget);
  
    // 2) Estilos mínimos
    const css = `
      #guest-chat-widget {
        position: fixed; bottom:20px; right:20px;
        width:280px; background:#fff; border:1px solid #ccc;
        box-shadow:0 2px 8px rgba(0,0,0,0.2); font-family:sans-serif; z-index:9999;
      }
      #guest-chat-header { background:#007bff; color:#fff; padding:8px; cursor:pointer; }
      #guest-chat-body { display:none; max-height:200px; overflow-y:auto; padding:8px; }
      #guest-chat-form { display:none; border-top:1px solid #eee; padding:8px; display:flex; }
      #guest-chat-input { flex:1; padding:4px; margin-right:4px; }
      #guest-chat-form button { padding:4px 8px; }
      .guest-msg { background:#e9f5ff; margin:4px 0; padding:6px; border-radius:4px; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  
    // 3) Variables DOM
    const header = widget.querySelector('#guest-chat-header');
    const body   = widget.querySelector('#guest-chat-body');
    const form   = widget.querySelector('#guest-chat-form');
    const input  = widget.querySelector('#guest-chat-input');
  
    let open = false;
    header.addEventListener('click', () => {
      open = !open;
      body.style.display = open ? 'block' : 'none';
      form .style.display = open ? 'flex'  : 'none';
    });
  
    // 4) Conectar a namespace /guest
    const socket = io(`${window.location.origin}/guest`, { transports:['websocket'] });
  
    // 5) Cargar historial al inicio
    socket.on('guest history', msgs => {
      body.innerHTML = '';
      msgs.forEach(m => appendMsg(m.text));
    });
  
    // 6) Escuchar nuevos mensajes
    socket.on('guest message', m => appendMsg(m.text));
  
    // 7) Enviar mensaje
    form.addEventListener('submit', e => {
      e.preventDefault();
      const txt = input.value.trim();
      if (!txt) return;
      socket.emit('guest message', txt);
      input.value = '';
    });
  
    // 8) Función para mostrar
    function appendMsg(text) {
      const d = document.createElement('div');
      d.className = 'guest-msg';
      d.textContent = text;
      body.appendChild(d);
      body.scrollTop = body.scrollHeight;
    }
  })();
  