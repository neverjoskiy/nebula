# app.py
from flask import Flask, render_template, request, redirect, session, jsonify, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room
import sqlite3
import os
import time
import json

app = Flask(__name__)
app.secret_key = 'your-super-secret-key'
socketio = SocketIO(app, cors_allowed_origins="*")

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Инициализация БД
def init_db():
    conn = sqlite3.connect('chat.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS messages
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  sender TEXT NOT NULL,
                  receiver TEXT,
                  content TEXT,
                  file_path TEXT,
                  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)''')
    conn.commit()
    conn.close()

init_db()

# Инициализация profiles.json
if not os.path.exists('profiles.json'):
    with open('profiles.json', 'w') as f:
        json.dump({}, f)

def user_exists(login):
    if not os.path.exists('users.txt'):
        return False
    with open('users.txt', 'r') as f:
        for line in f:
            if line.strip().split(':')[0] == login:
                return True
    return False

def check_user(login, password):
    if not os.path.exists('users.txt'):
        return False
    with open('users.txt', 'r') as f:
        for line in f:
            stored_login, stored_password = line.strip().split(':')
            if login == stored_login and password == stored_password:
                return True
    return False

@app.route('/')
def home():
    if 'login' not in session:
        return redirect('/login')
    return redirect('/chat')

@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        login = request.form['login']
        password = request.form['password']
        if not user_exists(login):
            error = "Пользователь не найден"
        elif not check_user(login, password):
            error = "Неверный пароль"
        else:
            session['login'] = login
            return redirect('/chat')
    return render_template('login.html', error=error)

@app.route('/register', methods=['GET', 'POST'])
def register():
    error = None
    if request.method == 'POST':
        login = request.form['login']
        password = request.form['password']
        if len(login) < 3:
            error = "Логин слишком короткий"
        elif len(password) < 6:
            error = "Пароль должен быть не менее 6 символов"
        elif user_exists(login):
            error = "Этот логин уже занят"
        else:
            with open('users.txt', 'a') as f:
                f.write(f"{login}:{password}\n")
            # Создаём файл друзей
            with open(f'friends_{login}.txt', 'w') as f:
                pass
            # Создаём профиль
            with open('profiles.json', 'r+') as f:
                try:
                    profiles = json.load(f)
                except:
                    profiles = {}
                profiles[login] = {
                    "avatar": "/static/default-avatar.png",
                    "bio": "Привет! Я в GlobalChat!"
                }
                f.seek(0)
                f.truncate()
                json.dump(profiles, f, indent=2)
            session['login'] = login
            return redirect('/chat')
    return render_template('register.html', error=error)

@app.route('/chat')
def chat():
    if 'login' not in session:
        return redirect('/login')
    return render_template('index.html', username=session['login'])

@app.route('/logout')
def logout():
    session.pop('login', None)
    return redirect('/login')

@app.route('/send', methods=['POST'])
def send_message():
    if 'login' not in session:
        return jsonify({'error': 'Not logged in'}), 401
        
    sender = session['login']
    content = request.form.get('content', '').strip()
    receiver = request.form.get('receiver')
    file = request.files.get('file')

    if not receiver:
        return jsonify({'error': 'Receiver not specified'}), 400

    file_path = None
    if file:
        filename = f"{int(time.time())}_{file.filename}"
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(file_path)
        file_path = f"/uploads/{filename}"

    conn = sqlite3.connect('chat.db')
    c = conn.cursor()
    c.execute("INSERT INTO messages (sender, receiver, content, file_path) VALUES (?, ?, ?, ?)",
              (sender, receiver, content, file_path))
    msg_id = c.lastrowid
    conn.commit()
    conn.close()

    socketio.emit('new_message', {
        'id': msg_id,
        'sender': sender,
        'receiver': receiver,
        'content': content,
        'file_path': file_path,
        'timestamp': time.strftime('%H:%M')
    }, room=sender)
    socketio.emit('new_message', {
        'id': msg_id,
        'sender': sender,
        'receiver': receiver,
        'content': content,
        'file_path': file_path,
        'timestamp': time.strftime('%H:%M')
    }, room=receiver)

    return jsonify({'id': msg_id})

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

@app.route('/messages/<username>')
def get_messages(username):
    if 'login' not in session:
        return jsonify({'error': 'Not logged in'}), 401
        
    other_user = request.args.get('with')
    if not other_user:
        return jsonify([])
        
    conn = sqlite3.connect('chat.db')
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""
        SELECT * FROM messages 
        WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)
        ORDER BY timestamp
    """, (username, other_user, other_user, username))
    rows = c.fetchall()
    messages = [dict(row) for row in rows]
    conn.close()
    return jsonify(messages)

@app.route('/chats/<username>')
def get_chats(username):
    if 'login' not in session:
        return jsonify({'error': 'Not logged in'}), 401
        
    friends = []
    try:
        conn = sqlite3.connect('chat.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("""
            SELECT DISTINCT receiver as friend FROM messages WHERE sender = ?
            UNION
            SELECT DISTINCT sender as friend FROM messages WHERE receiver = ?
        """, (username, username))
        rows = c.fetchall()
        friends = [row['friend'] for row in rows]
        conn.close()
    except Exception as e:
        print(f"Error getting chats from DB: {e}")

    friends_file = f'friends_{username}.txt'
    try:
        if os.path.exists(friends_file):
            with open(friends_file, 'r') as f:
                for line in f:
                    friend = line.strip()
                    if friend and friend not in friends:
                        friends.append(friend)
    except Exception as e:
        print(f"Error reading friends file: {e}")

    return jsonify(friends)

@app.route('/add_friend', methods=['POST'])
def add_friend():
    if 'login' not in session:
        return jsonify({'error': 'Not logged in'}), 401
        
    user = session['login']
    friend = request.json.get('friend')
    
    if not friend:
        return jsonify({'error': 'Friend not specified'}), 400
        
    if not user_exists(friend):
        return jsonify({'error': 'Пользователь не найден'}), 400

    filename = f'friends_{user}.txt'
    try:
        if os.path.exists(filename):
            with open(filename, 'r') as f:
                existing_friends = [line.strip() for line in f]
                if friend in existing_friends:
                    return jsonify({'ok': True})
                    
        with open(filename, 'a') as f:
            f.write(friend + '\n')
        return jsonify({'ok': True})
    except Exception as e:
        print(f"Error adding friend: {e}")
        return jsonify({'error': 'Не удалось добавить'}), 500

@app.route('/delete_message', methods=['POST'])
def delete_message():
    if 'login' not in session:
        return jsonify({'error': 'Not logged in'}), 401
        
    data = request.json
    msg_id = data.get('id')
    sender = session['login']

    if not msg_id:
        return jsonify({'error': 'Message ID not specified'}), 400

    conn = sqlite3.connect('chat.db')
    c = conn.cursor()
    c.execute("SELECT sender, receiver FROM messages WHERE id = ?", (msg_id,))
    row = c.fetchone()
    if row and row[0] == sender:
        receiver = row[1]
        c.execute("DELETE FROM messages WHERE id = ?", (msg_id,))
        conn.commit()
        socketio.emit('message_deleted', {'id': msg_id}, room=sender)
        socketio.emit('message_deleted', {'id': msg_id}, room=receiver)
        conn.close()
        return jsonify({'success': True})
    conn.close()
    return jsonify({'success': False}), 403

@app.route('/profile/<username>')
def get_profile(username):
    if not os.path.exists('profiles.json'):
        return jsonify({"avatar": "/static/default-avatar.png", "bio": "Нет описания"})
    try:
        with open('profiles.json', 'r') as f:
            profiles = json.load(f)
            return jsonify(profiles.get(username, {
                "avatar": "/static/default-avatar.png",
                "bio": "Пока ничего не написал"
            }))
    except Exception as e:
        print(f"Error loading profile: {e}")
        return jsonify({"avatar": "/static/default-avatar.png", "bio": "Ошибка загрузки профиля"})

@app.route('/update_profile', methods=['POST'])
def update_profile():
    if 'login' not in session:
        return jsonify({'error': 'Not logged in'}), 401
        
    user = session['login']
    avatar = request.form.get('avatar')
    bio = request.form.get('bio', '').strip()[:200]

    try:
        if os.path.exists('profiles.json'):
            with open('profiles.json', 'r') as f:
                profiles = json.load(f)
        else:
            profiles = {}
    except Exception as e:
        print(f"Error loading profiles: {e}")
        profiles = {}

    if user not in profiles:
        profiles[user] = {"avatar": "/static/default-avatar.png", "bio": "Привет!"}

    if avatar:
        profiles[user]['avatar'] = avatar
    if bio:
        profiles[user]['bio'] = bio

    try:
        with open('profiles.json', 'w') as f:
            json.dump(profiles, f, indent=2)
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error saving profile: {e}")
        return jsonify({'error': 'Failed to save profile'}), 500

@socketio.on('join')
def on_join(data):
    username = data.get('username')
    if username:
        join_room(username)
        print(f"User {username} joined room")

@socketio.on('leave')
def on_leave(data):
    username = data.get('username')
    if username:
        leave_room(username)
        print(f"User {username} left room")

@socketio.on('typing')
def handle_typing(data):
    to_user = data.get('to')
    if to_user:
        socketio.emit('typing', data, room=to_user)

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=8000, debug=True)