// --- Уведомления ---
if ('Notification' in window) {
  Notification.requestPermission();
}

function playSound() {
  const audio = new Audio('/static/message.mp3');
  audio.play().catch(() => {});
}

// --- Управление вкладками ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    btn.classList.add('active');
    const tabId = btn.dataset.tab + '-tab';
    document.getElementById(tabId).classList.add('active');
  });
});

// --- Загрузка чатов ---
function loadChats() {
  const username = document.body.dataset.user;
  if (!username) return;
  
  fetch(`/chats/${username}`)
    .then(res => {
      if (!res.ok) throw new Error('Network error');
      return res.json();
    })
    .then(friends => {
      const list = document.getElementById('friends-list');
      list.innerHTML = '';
      
      if (friends.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Нет чатов. Добавьте друзей!';
        li.style.color = '#64748b';
        li.style.fontStyle = 'italic';
        list.appendChild(li);
        return;
      }
      
      friends.forEach(friend => {
        const li = document.createElement('li');
        li.textContent = friend;
        li.onclick = () => openChat(friend);
        li.ondblclick = () => openProfile(friend);
        list.appendChild(li);
      });
    })
    .catch(error => {
      console.error('Error loading chats:', error);
      showNotification('Ошибка загрузки чатов', 'error');
    });
}

// --- Добавление друга ---
function addFriend() {
  const input = document.getElementById('friend-input');
  const name = input.value.trim();
  
  if (!name) {
    showNotification('Введите логин друга', 'error');
    return;
  }
  
  if (name === document.body.dataset.user) {
    showNotification('Нельзя добавить себя', 'error');
    return;
  }

  fetch('/add_friend', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ friend: name })
  })
  .then(res => {
    if (!res.ok) throw new Error('Network error');
    return res.json();
  })
  .then(data => {
    if (data.error) {
      showNotification(data.error, 'error');
    } else {
      input.value = '';
      loadChats();
      showNotification('Друг добавлен', 'success');
    }
  })
  .catch(error => {
    console.error('Error adding friend:', error);
    showNotification('Ошибка добавления друга', 'error');
  });
}

// --- Открытие чата ---
let currentFriend = null;

function openChat(friend) {
  if (!friend) return;
  
  currentFriend = friend;
  document.getElementById('chat-title').textContent = friend;
  document.getElementById('typing-indicator').style.display = 'none';
  
  // Убираем выделение у всех чатов
  document.querySelectorAll('#friends-list li').forEach(li => {
    li.classList.remove('active-chat');
  });
  
  // Добавляем выделение текущему чату
  document.querySelectorAll('#friends-list li').forEach(li => {
    if (li.textContent === friend) {
      li.classList.add('active-chat');
    }
  });
  
  loadMessages(friend);
  loadProfile(friend);
}

// --- Загрузка сообщений с датами ---
function loadMessages(friend) {
  const username = document.body.dataset.user;
  if (!username || !friend) return;
  
  fetch(`/messages/${username}?with=${encodeURIComponent(friend)}`)
    .then(res => {
      if (!res.ok) throw new Error('Network error');
      return res.json();
    })
    .then(messages => {
      const container = document.getElementById('messages');
      container.innerHTML = '';

      let lastDate = null;
      
      if (messages.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.textContent = 'Нет сообщений. Начните общение!';
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.color = '#64748b';
        emptyMsg.style.marginTop = '20px';
        container.appendChild(emptyMsg);
        return;
      }
      
      messages.forEach(msg => {
        const msgDate = new Date(msg.timestamp).toLocaleDateString();
        if (msgDate !== lastDate) {
          const divider = document.createElement('div');
          divider.className = 'date-divider';
          divider.textContent = msgDate;
          container.appendChild(divider);
          lastDate = msgDate;
        }
        addMessageToChat(msg.sender, msg.content, msg.file_path, msg.id, msg.sender === username);
      });
      container.scrollTop = container.scrollHeight;
    })
    .catch(error => {
      console.error('Error loading messages:', error);
      showNotification('Ошибка загрузки сообщений', 'error');
    });
}

// --- Отображение сообщения ---
function addMessageToChat(sender, content, file_path, id, isMe) {
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = `message ${isMe ? 'sent' : 'received'}`;
  div.dataset.msgId = id;

  // Добавляем отправителя для чужих сообщений
  if (!isMe) {
    const senderDiv = document.createElement('div');
    senderDiv.className = 'message-sender';
    senderDiv.textContent = sender;
    senderDiv.style.fontSize = '12px';
    senderDiv.style.color = '#64748b';
    senderDiv.style.marginBottom = '5px';
    div.appendChild(senderDiv);
  }

  if (content) {
    const text = document.createElement('div');
    text.textContent = content;
    text.className = 'message-text';
    div.appendChild(text);
  }

  if (file_path) {
    if (file_path.endsWith('.ogg') || file_path.includes('voice')) {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.style.marginTop = '5px';
      const source = document.createElement('source');
      source.src = file_path;
      source.type = 'audio/ogg';
      audio.appendChild(source);
      div.appendChild(audio);
    } else {
      const img = document.createElement('img');
      img.src = file_path;
      img.style.maxWidth = '200px';
      img.style.borderRadius = '8px';
      img.style.marginTop = '5px';
      img.onerror = function() {
        this.style.display = 'none';
        const link = document.createElement('a');
        link.href = file_path;
        link.textContent = 'Скачать файл';
        link.style.color = '#3b82f6';
        link.target = '_blank';
        div.appendChild(link);
      };
      div.appendChild(img);
    }
  }

  // Статус (только для своих)
  if (isMe) {
    const status = document.createElement('div');
    status.className = 'status sent';
    status.id = `status-${id}`;
    status.textContent = 'Отправлено';
    div.appendChild(status);
  }

  // Контекстное меню для удаления
  if (isMe) {
    div.oncontextmenu = function(e) {
      e.preventDefault();
      if (confirm('Удалить сообщение?')) {
        deleteMessage(id);
      }
    };
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// --- Отправка сообщения ---
function sendMessage() {
  if (!currentFriend) {
    showNotification('Выберите чат для отправки сообщения', 'error');
    return;
  }

  const input = document.getElementById('message-input');
  const fileInput = document.getElementById('file-input');
  const content = input.value.trim();
  
  if (!content && !fileInput.files[0]) {
    showNotification('Введите сообщение или выберите файл', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('receiver', currentFriend);
  formData.append('content', content);

  if (fileInput.files[0]) {
    formData.append('file', fileInput.files[0]);
  }

  fetch('/send', {
    method: 'POST',
    body: formData
  })
  .then(res => {
    if (!res.ok) throw new Error('Network error');
    return res.json();
  })
  .then(data => {
    if (content) {
      addMessageToChat(document.body.dataset.user, content, null, data.id, true);
      updateStatus(data.id, 'delivered');
    }
    if (fileInput.files[0]) {
      const isVoice = fileInput.files[0].type.startsWith('audio/');
      const url = isVoice ? '/uploads/voice.ogg' : URL.createObjectURL(fileInput.files[0]);
      addMessageToChat(document.body.dataset.user, null, url, data.id, true);
      updateStatus(data.id, 'delivered');
    }
    input.value = '';
    fileInput.value = '';
    
    // Отправка события печатания
    socket.emit('typing', {
      sender: document.body.dataset.user,
      to: currentFriend,
      typing: false
    });
  })
  .catch(error => {
    console.error('Error sending message:', error);
    showNotification('Ошибка отправки сообщения', 'error');
  });
}

// --- Статусы: доставлено, прочитано ---
function updateStatus(msgId, status) {
  const el = document.getElementById(`status-${msgId}`);
  if (!el) return;
  el.textContent = status === 'read' ? 'Прочитано' : 'Доставлено';
  el.className = `status ${status}`;
}

// --- Голосовое сообщение ---
function sendVoice() {
  if (!currentFriend) {
    showNotification('Выберите чат для отправки голосового сообщения', 'error');
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showNotification('Ваш браузер не поддерживает запись голоса', 'error');
    return;
  }

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      const mediaRecorder = new MediaRecorder(stream);
      const chunks = [];
      
      // Кнопка становится красной при записи
      const recordBtn = document.querySelector('button[onclick="sendVoice()"]');
      const originalColor = recordBtn.style.background;
      recordBtn.style.background = '#ef4444';
      
      mediaRecorder.start();
      
      // Останавливаем запись через 5 секунд
      const stopTimeout = setTimeout(() => {
        mediaRecorder.stop();
        recordBtn.style.background = originalColor;
      }, 5000);
      
      mediaRecorder.ondataavailable = e => chunks.push(e.data);
      
      mediaRecorder.onstop = () => {
        clearTimeout(stopTimeout);
        recordBtn.style.background = originalColor;
        
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('receiver', currentFriend);
        formData.append('file', blob, 'voice.webm');
        formData.append('content', '');
        
        fetch('/send', {
          method: 'POST',
          body: formData
        })
        .then(res => res.json())
        .then(data => {
          addMessageToChat(document.body.dataset.user, null, `/uploads/voice.webm`, data.id, true);
          updateStatus(data.id, 'delivered');
        })
        .catch(error => {
          console.error('Error sending voice:', error);
          showNotification('Ошибка отправки голосового сообщения', 'error');
        });
        
        // Останавливаем все треки
        stream.getTracks().forEach(track => track.stop());
      };
    })
    .catch(error => {
      console.error('Error accessing microphone:', error);
      showNotification('Не удалось получить доступ к микрофону', 'error');
    });
}

// --- Удаление сообщения ---
function deleteMessage(id) {
  fetch('/delete_message', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ id: id })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      const messageElement = document.querySelector(`[data-msg-id="${id}"]`);
      if (messageElement) {
        messageElement.remove();
      }
      showNotification('Сообщение удалено', 'success');
    } else {
      showNotification('Не удалось удалить сообщение', 'error');
    }
  })
  .catch(error => {
    console.error('Error deleting message:', error);
    showNotification('Ошибка удаления сообщения', 'error');
  });
}

// --- Профиль ---
function openProfile(user) {
  if (!user) return;
  
  fetch(`/profile/${user}`)
    .then(res => {
      if (!res.ok) throw new Error('Network error');
      return res.json();
    })
    .then(data => {
      document.getElementById('modal-avatar').src = data.avatar || '/static/default-avatar.png';
      document.getElementById('modal-username').textContent = user;
      document.getElementById('modal-bio').textContent = data.bio || 'Нет описания';
      document.getElementById('modal-status').textContent = 'Онлайн';
      document.getElementById('profile-modal').style.display = 'flex';
    })
    .catch(error => {
      console.error('Error loading profile:', error);
      showNotification('Ошибка загрузки профиля', 'error');
    });
}

function closeProfileModal() {
  document.getElementById('profile-modal').style.display = 'none';
}

// --- Обновление аватара ---
function updateAvatar() {
  const url = document.getElementById('avatar-url').value.trim();
  if (!url) {
    showNotification('Введите ссылку на аватар', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('avatar', url);
  formData.append('bio', document.getElementById('bio-input').value || '');

  fetch('/update_profile', {
    method: 'POST',
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      document.getElementById('avatar-preview').src = url;
      showNotification('Аватар обновлен', 'success');
    } else {
      showNotification('Ошибка обновления аватара', 'error');
    }
  })
  .catch(error => {
    console.error('Error updating avatar:', error);
    showNotification('Ошибка обновления аватара', 'error');
  });
}

// --- Обновление описания ---
function updateBio() {
  const bio = document.getElementById('bio-input').value.trim();

  const formData = new FormData();
  formData.append('bio', bio);

  fetch('/update_profile', {
    method: 'POST',
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      showNotification('Описание обновлено', 'success');
    } else {
      showNotification('Ошибка обновления описания', 'error');
    }
  })
  .catch(error => {
    console.error('Error updating bio:', error);
    showNotification('Ошибка обновления описания', 'error');
  });
}

// --- Загрузка профиля пользователя ---
function loadProfile(username) {
  if (!username) return;
  
  fetch(`/profile/${username}`)
    .then(res => {
      if (!res.ok) throw new Error('Network error');
      return res.json();
    })
    .then(data => {
      document.getElementById('avatar-preview').src = data.avatar || '/static/default-avatar.png';
      document.getElementById('bio-input').value = data.bio || '';
    })
    .catch(error => {
      console.error('Error loading profile:', error);
    });
}

// --- Показать уведомление ---
function showNotification(message, type) {
  // Удаляем старые уведомления
  document.querySelectorAll('.notification').forEach(el => el.remove());
  
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 3000);
}

// --- Обработка ввода сообщения (typing indicator) ---
let typingTimer;
document.getElementById('message-input').addEventListener('input', function() {
  if (!currentFriend) return;
  
  // Отправляем событие печатания
  socket.emit('typing', {
    sender: document.body.dataset.user,
    to: currentFriend,
    typing: true
  });
  
  // Сбрасываем таймер
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit('typing', {
      sender: document.body.dataset.user,
      to: currentFriend,
      typing: false
    });
  }, 1000);
});

// --- WebSocket события ---
socket.on('typing', (data) => {
  if (data.sender === currentFriend) {
    const indicator = document.getElementById('typing-indicator');
    if (data.typing) {
      indicator.style.display = 'block';
      indicator.textContent = `${currentFriend} печатает...`;
    } else {
      indicator.style.display = 'none';
    }
  }
});

socket.on('new_message', (data) => {
  if (data.sender === currentFriend || data.receiver === currentFriend) {
    addMessageToChat(data.sender, data.content, data.file_path, data.id, data.sender === document.body.dataset.user);
    if (data.sender !== document.body.dataset.user) {
      updateStatus(data.id, 'read');
    }
  }
  loadChats();

  // Уведомление
  if (document.hidden && data.receiver === document.body.dataset.user) {
    if (Notification.permission === 'granted') {
      new Notification(`Сообщение от ${data.sender}`, {
        body: data.content || "(фото/голос)",
        icon: "/static/default-avatar.png"
      });
    }
    playSound();
  }
});

socket.on('message_deleted', (data) => {
  const messageElement = document.querySelector(`[data-msg-id="${data.id}"]`);
  if (messageElement) {
    messageElement.remove();
  }
});

// --- Выход ---
function logout() {
  fetch('/logout')
    .then(() => {
      window.location.href = '/login';
    })
    .catch(error => {
      console.error('Error logging out:', error);
      window.location.href = '/login';
    });
}

// --- Тема ---
document.getElementById('dark-theme-toggle').addEventListener('change', (e) => {
  document.body.classList.toggle('dark-theme', e.target.checked);
  localStorage.setItem('darkTheme', e.target.checked);
});

// Загрузка сохраненной темы
document.addEventListener('DOMContentLoaded', function() {
  const darkTheme = localStorage.getItem('darkTheme') === 'true';
  document.getElementById('dark-theme-toggle').checked = darkTheme;
  document.body.classList.toggle('dark-theme', darkTheme);
});

// --- WebSocket ---
const socket = io();
const username = document.body.dataset.user;

if (username) {
  socket.emit('join', { username });
  
  // Загружаем чаты после небольшой задержки
  setTimeout(() => {
    loadChats();
    loadProfile(username);
  }, 1000);
}

// Обработка нажатия Enter для отправки сообщения
document.getElementById('message-input').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendMessage();
  }
});

// Обработка нажатия Enter для добавления друга
document.getElementById('friend-input').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    addFriend();
  }
});