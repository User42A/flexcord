const SUPABASE_URL = 'PASTE_YOUR_SUPABASE_URL_HERE';
const SUPABASE_ANON_KEY = 'PASTE_YOUR_SUPABASE_ANON_KEY_HERE';

let supabase = null;
let roomId = new URLSearchParams(window.location.search).get('room') || 'friends';
let currentUser = JSON.parse(localStorage.getItem(`flexcord_user_${roomId}`) || 'null');
let typingTimeout = null;

const qs = (s) => document.querySelector(s);
const qsa = (s) => [...document.querySelectorAll(s)];

const messagesEl = qs('#messages');
const eventsListEl = qs('#eventsList');
const membersListEl = qs('#membersList');
const joinModal = qs('#joinModal');
const roomNameEl = qs('#roomName');
const roomTagEl = qs('#roomTag');
const typingIndicatorEl = qs('#typingIndicator');
const currentUserCard = qs('#currentUserCard');

function showToast(text) {
  alert(text);
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatRoomName(room) {
  return room.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function formatTime(iso) {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return 'F';
  return parts.map(part => part[0].toUpperCase()).join('');
}

function createAvatarDataUrl(name = '') {
  const initials = getInitials(name);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <rect width="128" height="128" rx="32" fill="#f8dce8"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="44" font-weight="700" fill="#8b4c67">${initials}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function setCurrentUserCard() {
  if (!currentUser) return;
  currentUserCard.innerHTML = `
    <img class="avatar-img" src="${escapeHtml(currentUser.avatar_url)}" alt="avatar" />
    <div>
      <strong>${escapeHtml(currentUser.username)}</strong>
      <p id="roomTag">#${escapeHtml(roomId)}</p>
    </div>
  `;
}

function initSupabase() {
  if (SUPABASE_URL.startsWith('PASTE_')) {
    showToast('Add your Supabase URL and anon key in app.js first.');
    return false;
  }
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return true;
}

async function ensureRoom() {
  const { data: existing, error: readError } = await supabase.from('rooms').select('*').eq('slug', roomId).maybeSingle();
  if (readError) throw readError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from('rooms')
    .insert({ name: formatRoomName(roomId), slug: roomId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function ensureMember() {
  const { data: existing, error: existingError } = await supabase
    .from('members')
    .select('*')
    .eq('room_slug', roomId)
    .eq('username', currentUser.username)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    const nextAvatar = currentUser.avatar_url || existing.avatar_url || createAvatarDataUrl(currentUser.username);
    currentUser.id = existing.id;
    currentUser.avatar_url = nextAvatar;
    localStorage.setItem(`flexcord_user_${roomId}`, JSON.stringify(currentUser));

    if (existing.avatar_url !== nextAvatar) {
      const { error: updateError } = await supabase
        .from('members')
        .update({ avatar_url: nextAvatar })
        .eq('id', existing.id);
      if (updateError) throw updateError;
    }

    return existing;
  }

  const { data, error } = await supabase
    .from('members')
    .insert({
      room_slug: roomId,
      username: currentUser.username,
      avatar_url: currentUser.avatar_url || createAvatarDataUrl(currentUser.username),
    })
    .select()
    .single();

  if (error) throw error;
  currentUser.id = data.id;
  currentUser.avatar_url = data.avatar_url;
  localStorage.setItem(`flexcord_user_${roomId}`, JSON.stringify(currentUser));
  return data;
}

function renderMessage(message) {
  const tpl = qs('#messageTemplate').content.cloneNode(true);
  tpl.querySelector('.avatar-img').src = message.avatar_url || createAvatarDataUrl(message.username);
  tpl.querySelector('.message-user').textContent = message.username;
  tpl.querySelector('.message-time').textContent = formatTime(message.created_at);
  tpl.querySelector('.message-text').textContent = message.text || '';

  const img = tpl.querySelector('.message-image');
  if (message.image_url) {
    img.src = message.image_url;
    img.classList.remove('hidden');
  }

  tpl.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', () => reactToMessage(message.id, btn.dataset.reaction));
  });

  messagesEl.appendChild(tpl);
}

function renderEvent(event) {
  const card = document.createElement('article');
  card.className = 'event-card';
  card.innerHTML = `
    <strong>${escapeHtml(event.title)}</strong>
    <p>${escapeHtml(event.event_date)} · ${escapeHtml(event.event_time)}</p>
    <p class="muted">Created by ${escapeHtml(event.creator_name)}</p>
  `;
  eventsListEl.appendChild(card);
}

function renderMember(member) {
  const card = document.createElement('article');
  card.className = 'member-card';
  card.innerHTML = `
    <img class="avatar-img" src="${escapeHtml(member.avatar_url || createAvatarDataUrl(member.username))}" alt="avatar" />
    <div>
      <strong>${escapeHtml(member.username)}</strong>
      <p class="muted">Joined FlexCord</p>
    </div>
  `;
  membersListEl.appendChild(card);
}

async function loadMessages() {
  messagesEl.innerHTML = '';
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('room_slug', roomId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error(error);
    return;
  }
  data.forEach(renderMessage);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function loadEvents() {
  eventsListEl.innerHTML = '';
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('room_slug', roomId)
    .order('event_date', { ascending: true })
    .order('event_time', { ascending: true });
  if (error) {
    console.error(error);
    return;
  }
  data.forEach(renderEvent);
}

async function loadMembers() {
  membersListEl.innerHTML = '';
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('room_slug', roomId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error(error);
    return;
  }
  data.forEach(renderMember);
}

async function sendMessage(text, imageUrl) {
  const payload = {
    room_slug: roomId,
    username: currentUser.username,
    avatar_url: currentUser.avatar_url,
    text,
    image_url: imageUrl || null,
  };
  const { error } = await supabase.from('messages').insert(payload);
  if (error) console.error(error);
}

async function addEvent(title, date, time) {
  const { error } = await supabase.from('events').insert({
    room_slug: roomId,
    title,
    event_date: date,
    event_time: time,
    creator_name: currentUser.username,
  });
  if (error) console.error(error);
}

async function reactToMessage(messageId, emoji) {
  const { error } = await supabase.from('reactions').insert({
    room_slug: roomId,
    message_id: messageId,
    emoji,
    username: currentUser.username,
  });
  if (error) console.error(error);
  showToast(`Reaction ${emoji} added`);
}

async function updateTyping(isTyping) {
  if (!currentUser?.id) return;
  await supabase.from('members').update({ is_typing: isTyping }).eq('id', currentUser.id);
}

function setupRealtime() {
  supabase
    .channel(`room:${roomId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_slug=eq.${roomId}` }, payload => {
      renderMessage(payload.new);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter: `room_slug=eq.${roomId}` }, payload => {
      renderEvent(payload.new);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `room_slug=eq.${roomId}` }, async () => {
      await loadMembers();
      await refreshTypingIndicator();
    })
    .subscribe();
}

async function refreshTypingIndicator() {
  const { data } = await supabase
    .from('members')
    .select('username, is_typing')
    .eq('room_slug', roomId)
    .eq('is_typing', true);
  const others = (data || []).filter(m => m.username !== currentUser?.username);
  typingIndicatorEl.textContent = others.length ? `${others.map(m => m.username).join(', ')} typing…` : '';
}

function setupViews() {
  qsa('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('.nav-btn').forEach(b => b.classList.remove('active'));
      qsa('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      qs(`#${btn.dataset.view}View`).classList.add('active');
    });
  });
}

function setupForms() {
  qs('#joinForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = qs('#displayName').value.trim();
    if (!username) {
      showToast('Please enter your name.');
      return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Joining…';

    try {
      currentUser = {
        username,
        avatar_url: createAvatarDataUrl(username),
      };
      localStorage.setItem(`flexcord_user_${roomId}`, JSON.stringify(currentUser));
      await ensureMember();
      joinModal.style.display = 'none';
      setCurrentUserCard();
      await loadMembers();
    } catch (error) {
      console.error(error);
      showToast('Could not join the room. Check your Supabase URL, anon key, and table policies.');
      joinModal.style.display = 'flex';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enter chat';
    }
  });

  qs('#messageForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = qs('#messageInput').value.trim();
    const imageUrl = qs('#imageInput').value.trim();
    if (!text && !imageUrl) return;
    await sendMessage(text, imageUrl);
    qs('#messageInput').value = '';
    qs('#imageInput').value = '';
    await updateTyping(false);
  });

  qs('#eventForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await addEvent(qs('#eventTitle').value, qs('#eventDate').value, qs('#eventTime').value);
    e.target.reset();
  });

  qs('#messageInput').addEventListener('input', async () => {
    clearTimeout(typingTimeout);
    await updateTyping(true);
    typingTimeout = setTimeout(() => updateTyping(false), 1400);
  });

  qs('#copyInviteBtn').addEventListener('click', async () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    await navigator.clipboard.writeText(url);
    showToast('Invite link copied');
  });
}

async function start() {
  roomNameEl.textContent = formatRoomName(roomId);
  roomTagEl.textContent = `#${roomId}`;
  setupViews();
  setupForms();

  if (!initSupabase()) return;
  await ensureRoom();

  if (currentUser?.username) {
    currentUser.avatar_url = currentUser.avatar_url || createAvatarDataUrl(currentUser.username);
    joinModal.style.display = 'none';
    await ensureMember();
    setCurrentUserCard();
  } else {
    joinModal.style.display = 'flex';
  }

  await Promise.all([loadMessages(), loadEvents(), loadMembers(), refreshTypingIndicator()]);
  setupRealtime();
}

start().catch(err => {
  console.error(err);
  showToast('Setup failed. Check README and Supabase setup.');
});
