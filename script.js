/**
 * NexusAI — Chatbot Script
 * Gemini 2.5 Flash API Integration
 * Features: Chat history, LocalStorage, Skeleton loading,
 *           Typewriter effect, Markdown rendering, Copy, Export
 */

'use strict';

/* ══════════════════════════════════════════════
   1. CONFIG — put your Gemini API key here
   ══════════════════════════════════════════════ */
const API_KEY  = process.env.gemini_api; // Replace with your actual Gemini API key
const API_URL  = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

/* ══════════════════════════════════════════════
   2. STATE
   ══════════════════════════════════════════════ */
let sessions        = [];       // Array of chat sessions
let activeSessionId = null;     // Currently visible session id
let isGenerating    = false;    // Lock while waiting for API
let lastUserPrompt  = null;     // For retry functionality
const STORAGE_KEY   = 'nexusai_sessions';

/* ══════════════════════════════════════════════
   3. DOM REFERENCES
   ══════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const appShell          = $('appShell');
const sidebar           = $('sidebar');
const sidebarOverlay    = $('sidebarOverlay');
const btnHamburger      = $('btnHamburger');
const btnNewChat        = $('btnNewChat');
const btnExport         = $('btnExport');
const btnClearHistory   = $('btnClearHistory');
const chatHistoryList   = $('chatHistoryList');
const historyEmpty      = $('historyEmpty');
const messagesContainer = $('messagesContainer');
const welcomeScreen     = $('welcomeScreen');
const messagesList      = $('messagesList');
const userInput         = $('userInput');
const sendBtn           = $('sendBtn');
const inputWrapper      = $('inputWrapper');
const charCount         = $('charCount');
const msgCountLabel     = $('msgCountLabel');
const topbarTitle       = $('topbarTitle');
const clearModal        = $('clearModal');
const btnCancelClear    = $('btnCancelClear');
const btnConfirmClear   = $('btnConfirmClear');
const toastContainer    = $('toastContainer');
const particleCanvas    = $('particleCanvas');

/* ══════════════════════════════════════════════
   4. PARTICLE SYSTEM
   ══════════════════════════════════════════════ */
(function initParticles() {
  const ctx = particleCanvas.getContext('2d');
  let particles = [];
  let rafId;

  function resize() {
    particleCanvas.width  = window.innerWidth;
    particleCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  /** Create a single particle with random properties */
  function makeParticle() {
    return {
      x:    Math.random() * particleCanvas.width,
      y:    Math.random() * particleCanvas.height,
      size: Math.random() * 1.5 + 0.4,
      vx:   (Math.random() - 0.5) * 0.22,
      vy:   (Math.random() - 0.5) * 0.22,
      // Alternate between violet and cyan hues
      hue:  Math.random() > 0.5 ? 270 : 192,
      alpha: Math.random() * 0.4 + 0.15,
    };
  }

  // Spawn 80 particles
  for (let i = 0; i < 80; i++) particles.push(makeParticle());

  function draw() {
    ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      // Wrap edges
      if (p.x < 0) p.x = particleCanvas.width;
      if (p.x > particleCanvas.width) p.x = 0;
      if (p.y < 0) p.y = particleCanvas.height;
      if (p.y > particleCanvas.height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, ${p.alpha})`;
      ctx.fill();
    });
    rafId = requestAnimationFrame(draw);
  }
  draw();
})();

/* ══════════════════════════════════════════════
   5. MARKDOWN RENDERER (lightweight)
   ══════════════════════════════════════════════ */
function renderMarkdown(text) {
  // Escape HTML first to prevent XSS
  const escHtml = s => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Extract and protect code blocks
  const codeBlocks = [];
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang: lang || 'code', code: escHtml(code.trim()) });
    return `\x00CODE${idx}\x00`;
  });

  // Escape remaining HTML
  text = escHtml(text);

  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings
  text = text.replace(/^######\s(.+)$/gm, '<h6>$1</h6>');
  text = text.replace(/^#####\s(.+)$/gm,  '<h5>$1</h5>');
  text = text.replace(/^####\s(.+)$/gm,   '<h4>$1</h4>');
  text = text.replace(/^###\s(.+)$/gm,    '<h3>$1</h3>');
  text = text.replace(/^##\s(.+)$/gm,     '<h2>$1</h2>');
  text = text.replace(/^#\s(.+)$/gm,      '<h1>$1</h1>');

  // Bold & Italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g,         '<em>$1</em>');
  text = text.replace(/__(.+?)__/g,         '<strong>$1</strong>');
  text = text.replace(/_(.+?)_/g,           '<em>$1</em>');

  // Horizontal rule
  text = text.replace(/^(-{3,}|\*{3,})$/gm, '<hr>');

  // Blockquote
  text = text.replace(/^&gt;\s(.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  text = text.replace(/(?:^[-*+]\s.+\n?)+/gm, match => {
    const items = match.trim().split('\n')
      .map(l => `<li>${l.replace(/^[-*+]\s/, '')}</li>`)
      .join('');
    return `<ul>${items}</ul>`;
  });

  // Ordered lists
  text = text.replace(/(?:^\d+\.\s.+\n?)+/gm, match => {
    const items = match.trim().split('\n')
      .map(l => `<li>${l.replace(/^\d+\.\s/, '')}</li>`)
      .join('');
    return `<ol>${items}</ol>`;
  });

  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Paragraphs: wrap lines separated by blank lines
  text = text
    .split(/\n{2,}/)
    .map(block => {
      block = block.trim();
      if (!block) return '';
      if (/^<(h[1-6]|ul|ol|li|blockquote|hr|pre)/.test(block)) return block;
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  // Restore code blocks
  text = text.replace(/\x00CODE(\d+)\x00/g, (_, i) => {
    const { lang, code } = codeBlocks[+i];
    return `<pre><button class="code-copy" data-code="${encodeURIComponent(codeBlocks[+i].code)}">Copy</button><code class="lang-${lang}">${code}</code></pre>`;
  });

  return text;
}

/* ══════════════════════════════════════════════
   6. SESSION / STORAGE MANAGEMENT
   ══════════════════════════════════════════════ */
function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    sessions = raw ? JSON.parse(raw) : [];
  } catch { sessions = []; }
}

function saveSessions() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)); }
  catch { showToast('Storage quota exceeded — older chats may not be saved.', 'error'); }
}

function getActiveSession() {
  return sessions.find(s => s.id === activeSessionId) || null;
}

/** Create a new session and activate it */
function createNewSession(firstMessage = '') {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const title = firstMessage
    ? firstMessage.substring(0, 42) + (firstMessage.length > 42 ? '…' : '')
    : 'New Chat';
  const session = { id, title, messages: [], createdAt: Date.now() };
  sessions.unshift(session);
  saveSessions();
  activateSession(id, false);
  return session;
}

/** Switch to a session */
function activateSession(id, render = true) {
  activeSessionId = id;
  if (render) renderActiveSession();
  renderHistoryList();
  updateStats();
}

/** Add a message object to the active session */
function pushMessage(role, content) {
  const session = getActiveSession();
  if (!session) return;
  const msg = {
    id:        Date.now().toString(36) + Math.random().toString(36).slice(2),
    role,
    content,
    timestamp: Date.now(),
  };
  session.messages.push(msg);
  // Keep session title = first user message
  if (role === 'user' && session.messages.filter(m => m.role === 'user').length === 1) {
    session.title = content.substring(0, 42) + (content.length > 42 ? '…' : '');
  }
  saveSessions();
  updateStats();
  return msg;
}

/* ══════════════════════════════════════════════
   7. UI RENDERING
   ══════════════════════════════════════════════ */

/** Render the full message list for the active session */
function renderActiveSession() {
  const session = getActiveSession();
  messagesList.innerHTML = '';

  if (!session || session.messages.length === 0) {
    showWelcome();
    topbarTitle.textContent = 'NexusAI';
    return;
  }

  hideWelcome();
  topbarTitle.textContent = session.title;

  session.messages.forEach(msg => {
    appendMessageDOM(msg.role, msg.content, msg.timestamp, false);
  });
  scrollToBottom();
}

/** Render sidebar history list */
function renderHistoryList() {
  const items = sessions;
  historyEmpty.style.display = items.length === 0 ? 'flex' : 'none';

  // Remove existing history items (keep the empty placeholder)
  chatHistoryList.querySelectorAll('.history-item').forEach(el => el.remove());

  items.forEach(session => {
    const el = document.createElement('div');
    el.className = 'history-item' + (session.id === activeSessionId ? ' active' : '');
    el.dataset.id = session.id;
    el.innerHTML = `
      <div class="history-item-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <div class="history-item-text">
        <div class="history-item-title">${escText(session.title)}</div>
        <div class="history-item-meta">${formatRelativeTime(session.createdAt)} · ${session.messages.length} msg${session.messages.length !== 1 ? 's' : ''}</div>
      </div>
      <button class="history-item-del" data-del="${session.id}" title="Delete session">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>`;
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-del]')) {
        deleteSession(session.id);
      } else {
        closeSidebar();
        activateSession(session.id);
      }
    });
    chatHistoryList.appendChild(el);
  });
}

/**
 * Create and append a message bubble to the DOM.
 * @param {string}  role       'user' | 'ai'
 * @param {string}  content    Raw text
 * @param {number}  timestamp  Unix ms
 * @param {boolean} animate    Use typewriter for AI messages
 * @returns {HTMLElement} The bubble element (for skeleton replacement)
 */
function appendMessageDOM(role, content, timestamp = Date.now(), animate = false) {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  const isAI = role === 'ai';
  const avatarLabel = isAI ? '✦' : 'U';
  const avatarClass = isAI ? 'ai' : 'user-av';
  const timeStr     = formatTime(timestamp);
  const renderedHTML = renderMarkdown(content);

  row.innerHTML = `
    <div class="msg-avatar ${avatarClass}">${avatarLabel}</div>
    <div class="msg-bubble-wrap">
      <div class="msg-bubble" id="bubble-${timestamp}"></div>
      <div class="msg-meta">
        <span class="msg-time">${timeStr}</span>
        ${isAI ? `<button class="msg-copy-btn" title="Copy response">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy
        </button>` : ''}
      </div>
    </div>`;

  messagesList.appendChild(row);
  const bubble = row.querySelector('.msg-bubble');

  if (isAI && animate) {
    typewriterEffect(bubble, renderedHTML, content, () => {
      // Attach code-copy handlers after render
      attachCodeCopyHandlers(bubble);
    });
  } else {
    bubble.innerHTML = renderedHTML;
    attachCodeCopyHandlers(bubble);
  }

  // Copy button
  const copyBtn = row.querySelector('.msg-copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => copyToClipboard(content, copyBtn));
  }

  scrollToBottom();
  return row;
}

/** Insert skeleton placeholder row, returns the row element */
function appendSkeletonDOM() {
  const row = document.createElement('div');
  row.className = 'message-row ai';
  row.id = 'skeletonRow';
  row.innerHTML = `
    <div class="msg-avatar ai">✦</div>
    <div class="msg-bubble-wrap">
      <div class="msg-bubble skeleton-bubble">
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
      </div>
    </div>`;
  messagesList.appendChild(row);
  scrollToBottom();
  return row;
}

/** Show error in an AI bubble, with a retry button */
function appendErrorDOM(errorMsg, retryPrompt) {
  removeSkeletonDOM();
  const row = document.createElement('div');
  row.className = 'message-row ai';
  row.innerHTML = `
    <div class="msg-avatar ai">✦</div>
    <div class="msg-bubble-wrap">
      <div class="msg-bubble error-bubble">
        <strong>⚠ Error:</strong> ${escText(errorMsg)}
        <br>
        <button class="retry-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.31"/>
          </svg>
          Retry
        </button>
      </div>
      <div class="msg-meta">
        <span class="msg-time">${formatTime(Date.now())}</span>
      </div>
    </div>`;
  row.querySelector('.retry-btn').addEventListener('click', () => {
    row.remove();
    if (retryPrompt) sendMessage(retryPrompt);
  });
  messagesList.appendChild(row);
  scrollToBottom();
}

function removeSkeletonDOM() {
  const sk = $('skeletonRow');
  if (sk) sk.remove();
}

/* ══════════════════════════════════════════════
   8. TYPEWRITER EFFECT
   ══════════════════════════════════════════════ */
/**
 * Renders HTML content into a container character-by-character.
 * Operates on the visible text nodes for a clean cursor effect.
 */
function typewriterEffect(container, htmlContent, rawText, onDone) {
  // For complex markdown, set HTML immediately but animate opacity
  // For plain text, do actual char-by-char
  const hasComplexMarkdown = /<(pre|table|ul|ol|h[1-6])/i.test(htmlContent);

  if (hasComplexMarkdown) {
    container.innerHTML = htmlContent;
    container.style.opacity = '0';
    container.style.transition = 'opacity 0.4s ease';
    requestAnimationFrame(() => { container.style.opacity = '1'; });
    setTimeout(onDone, 420);
    return;
  }

  // Char-by-char on plain text, then replace with rendered HTML
  const chars = rawText.split('');
  let i = 0;
  container.textContent = '';

  const interval = setInterval(() => {
    if (i >= chars.length) {
      clearInterval(interval);
      container.innerHTML = htmlContent;
      onDone && onDone();
      return;
    }
    // Batch chars for speed
    const batch = Math.min(3, chars.length - i);
    container.textContent += chars.slice(i, i + batch).join('');
    i += batch;
    scrollToBottom();
  }, 12);
}

/* ══════════════════════════════════════════════
   9. GEMINI API
   ══════════════════════════════════════════════ */
async function callGeminiAPI(prompt) {
  const session = getActiveSession();
  // Build conversation context (last 12 messages for context window)
  const recentMessages = session
    ? session.messages.slice(-12).map(m => ({
        role: m.role === 'ai' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))
    : [];

  // The last entry is the current prompt (already pushed)
  // Remove the last entry since we'll append it manually
  const historyContext = recentMessages.slice(0, -1);

  const body = {
    contents: [
      ...historyContext,
      { role: 'user', parts: [{ text: prompt }] }
    ],
    generationConfig: {
      temperature: 0.9,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errMsg  = errData?.error?.message || `HTTP ${response.status}`;
    throw new Error(errMsg);
  }

  const data = await response.json();
  const candidate = data?.candidates?.[0];
  if (!candidate) throw new Error('No response candidates returned.');

  const finishReason = candidate.finishReason;
  if (finishReason === 'SAFETY') throw new Error('Response blocked by safety filters.');

  return candidate?.content?.parts?.[0]?.text || '*(empty response)*';
}

/* ══════════════════════════════════════════════
   10. SEND MESSAGE FLOW
   ══════════════════════════════════════════════ */
async function sendMessage(promptOverride = null) {
  if (isGenerating) return;

  const prompt = (promptOverride || userInput.value.trim()).trim();
  if (!prompt) return;

  // Validate API key
  if (API_KEY === 'YOUR_API_KEY' || !API_KEY) {
    showToast('Please set your Gemini API key in script.js (API_KEY variable).', 'error');
    return;
  }

  // Clear input
  if (!promptOverride) {
    userInput.value = '';
    autoResizeTextarea();
    updateCharCount();
  }

  lastUserPrompt = prompt;
  isGenerating   = true;
  setInputState(false);

  // Create session on first message
  if (!activeSessionId || !getActiveSession()) {
    createNewSession(prompt);
  }

  // Hide welcome, show messages
  hideWelcome();

  // Add user message
  pushMessage('user', prompt);
  appendMessageDOM('user', prompt, Date.now(), false);

  // Skeleton
  appendSkeletonDOM();

  try {
    const aiText = await callGeminiAPI(prompt);
    removeSkeletonDOM();
    pushMessage('ai', aiText);
    appendMessageDOM('ai', aiText, Date.now(), true);
    renderHistoryList();
  } catch (err) {
    console.error('Gemini API error:', err);
    showToast(err.message || 'Failed to get a response.', 'error');
    appendErrorDOM(err.message || 'Unknown error', prompt);
  } finally {
    isGenerating = false;
    setInputState(true);
    userInput.focus();
  }
}

/* ══════════════════════════════════════════════
   11. SESSION MANAGEMENT ACTIONS
   ══════════════════════════════════════════════ */
function deleteSession(id) {
  sessions = sessions.filter(s => s.id !== id);
  saveSessions();
  if (activeSessionId === id) {
    activeSessionId = sessions[0]?.id || null;
    renderActiveSession();
  }
  renderHistoryList();
  updateStats();
  showToast('Chat deleted.', 'info');
}

function clearAllHistory() {
  sessions        = [];
  activeSessionId = null;
  saveSessions();
  renderHistoryList();
  renderActiveSession();
  updateStats();
  showToast('All history cleared.', 'success');
}

function startNewChat() {
  activeSessionId = null;
  messagesList.innerHTML = '';
  showWelcome();
  topbarTitle.textContent = 'NexusAI';
  updateStats();
  renderHistoryList();
  userInput.focus();
  closeSidebar();
}

/* ══════════════════════════════════════════════
   12. EXPORT
   ══════════════════════════════════════════════ */
function exportCurrentChat() {
  const session = getActiveSession();
  if (!session || session.messages.length === 0) {
    showToast('No active chat to export.', 'info');
    return;
  }

  let txt = `NexusAI Chat Export\n`;
  txt += `Session: ${session.title}\n`;
  txt += `Date: ${new Date(session.createdAt).toLocaleString()}\n`;
  txt += '═'.repeat(60) + '\n\n';

  session.messages.forEach(msg => {
    const role = msg.role === 'user' ? 'You' : 'NexusAI';
    const time = new Date(msg.timestamp).toLocaleTimeString();
    txt += `[${time}] ${role}:\n${msg.content}\n\n`;
    txt += '─'.repeat(40) + '\n\n';
  });

  const blob = new Blob([txt], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `nexusai-${session.id}.txt`,
  });
  a.click();
  URL.revokeObjectURL(url);
  showToast('Chat exported!', 'success');
}

/* ══════════════════════════════════════════════
   13. UI HELPERS
   ══════════════════════════════════════════════ */
function showWelcome() {
  welcomeScreen.classList.remove('hidden');
}
function hideWelcome() {
  welcomeScreen.classList.add('hidden');
}

function setInputState(enabled) {
  inputWrapper.classList.toggle('disabled', !enabled);
  userInput.disabled  = !enabled;
  sendBtn.disabled    = !enabled || userInput.value.trim() === '';

  if (!enabled) {
    sendBtn.classList.add('loading');
  } else {
    sendBtn.classList.remove('loading');
    updateSendBtn();
  }
}

function updateSendBtn() {
  sendBtn.disabled = isGenerating || userInput.value.trim() === '';
}

function autoResizeTextarea() {
  userInput.style.height = 'auto';
  const maxH = 180;
  userInput.style.height = Math.min(userInput.scrollHeight, maxH) + 'px';
}

function updateCharCount() {
  const len = userInput.value.length;
  charCount.textContent = `${len} / 8000`;
  charCount.className = 'char-count' +
    (len > 7500 ? ' danger' : len > 6000 ? ' warn' : '');
}

function scrollToBottom() {
  messagesContainer.scrollTo({
    top: messagesContainer.scrollHeight,
    behavior: 'smooth',
  });
}

function updateStats() {
  const session = getActiveSession();
  const count   = session ? session.messages.length : 0;
  msgCountLabel.textContent = `${count} message${count !== 1 ? 's' : ''}`;
}

function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('active');
  btnHamburger.classList.add('open');
}
function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('active');
  btnHamburger.classList.remove('open');
}

/* ══════════════════════════════════════════════
   14. COPY TO CLIPBOARD
   ══════════════════════════════════════════════ */
async function copyToClipboard(text, btnEl) {
  try {
    await navigator.clipboard.writeText(text);
    if (btnEl) {
      const orig = btnEl.innerHTML;
      btnEl.classList.add('copied');
      btnEl.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
      setTimeout(() => {
        btnEl.classList.remove('copied');
        btnEl.innerHTML = orig;
      }, 2000);
    }
    showToast('Copied to clipboard!', 'success');
  } catch {
    showToast('Failed to copy.', 'error');
  }
}

/** Attach copy handlers to code block buttons inside a bubble */
function attachCodeCopyHandlers(bubble) {
  bubble.querySelectorAll('.code-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = decodeURIComponent(btn.dataset.code || '');
      copyToClipboard(code, btn);
    });
  });
}

/* ══════════════════════════════════════════════
   15. TOAST NOTIFICATIONS
   ══════════════════════════════════════════════ */
/**
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} duration ms
 */
function showToast(message, type = 'info', duration = 3500) {
  const icons = {
    success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${escText(message)}</span>`;
  toastContainer.appendChild(toast);

  const remove = () => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };
  const timer = setTimeout(remove, duration);
  toast.addEventListener('click', () => { clearTimeout(timer); remove(); });
}

/* ══════════════════════════════════════════════
   16. RIPPLE EFFECT
   ══════════════════════════════════════════════ */
function addRipple(e, el) {
  const rect   = el.getBoundingClientRect();
  const size   = Math.max(rect.width, rect.height) * 2;
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.cssText = `
    width: ${size}px; height: ${size}px;
    left: ${e.clientX - rect.left - size / 2}px;
    top:  ${e.clientY - rect.top  - size / 2}px;
  `;
  el.style.position = 'relative';
  el.style.overflow = 'hidden';
  el.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}

/* ══════════════════════════════════════════════
   17. UTILITY FUNCTIONS
   ══════════════════════════════════════════════ */
function escText(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  const m    = Math.floor(diff / 60000);
  const h    = Math.floor(diff / 3600000);
  const d    = Math.floor(diff / 86400000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  if (h < 24)  return `${h}h ago`;
  return `${d}d ago`;
}

/* ══════════════════════════════════════════════
   18. EVENT LISTENERS
   ══════════════════════════════════════════════ */

// Input: auto-resize + char count + send button state
userInput.addEventListener('input', () => {
  autoResizeTextarea();
  updateCharCount();
  updateSendBtn();
});

// Enter to send (Shift+Enter = newline)
userInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendMessage();
  }
});

// Send button
sendBtn.addEventListener('click', (e) => {
  addRipple(e, sendBtn);
  sendMessage();
});

// New chat
btnNewChat.addEventListener('click', (e) => {
  addRipple(e, btnNewChat);
  startNewChat();
});

// Hamburger
btnHamburger.addEventListener('click', () => {
  sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});

// Sidebar overlay click
sidebarOverlay.addEventListener('click', closeSidebar);

// Export
btnExport.addEventListener('click', exportCurrentChat);

// Clear history
btnClearHistory.addEventListener('click', () => {
  clearModal.classList.add('open');
});
btnCancelClear.addEventListener('click', () => {
  clearModal.classList.remove('open');
});
btnConfirmClear.addEventListener('click', (e) => {
  addRipple(e, btnConfirmClear);
  clearAllHistory();
  clearModal.classList.remove('open');
});

// Close modal on overlay click
clearModal.addEventListener('click', (e) => {
  if (e.target === clearModal) clearModal.classList.remove('open');
});

// Suggestion chips on welcome screen
welcomeScreen.addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (chip) {
    const prompt = chip.dataset.prompt;
    userInput.value = prompt;
    autoResizeTextarea();
    updateCharCount();
    updateSendBtn();
    sendMessage(prompt);
    userInput.value = '';
  }
});

/* ══════════════════════════════════════════════
   19. WELCOME ANIMATION
   ══════════════════════════════════════════════ */
function runWelcomeAnimation() {
  appShell.style.opacity = '0';
  appShell.style.transform = 'translateY(8px)';
  appShell.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      appShell.style.opacity   = '1';
      appShell.style.transform = 'translateY(0)';
    });
  });
}

/* ══════════════════════════════════════════════
   20. INIT
   ══════════════════════════════════════════════ */
function init() {
  loadSessions();

  // Restore most recent session if any
  if (sessions.length > 0) {
    activeSessionId = sessions[0].id;
    renderActiveSession();
  } else {
    showWelcome();
  }

  renderHistoryList();
  updateStats();
  updateCharCount();
  runWelcomeAnimation();

  // Focus input
  setTimeout(() => userInput.focus(), 600);
}

init();