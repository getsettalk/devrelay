// DevRelay - Main JavaScript Application
(function() {
    'use strict';

    // Global state
    let socket = null;
    let currentUser = null;
    let currentRoom = null;
    let typingTimeout = null;
    let isTyping = false;
    let isNearBottom = true;
    let unreadCount = 0;
    let messageIdCounter = 0;
    let pendingFile = null; // Store pending file to be sent

    // DOM Elements
    const loginScreen = document.getElementById('login-screen');
    const chatInterface = document.getElementById('chat-interface');
    const joinForm = document.getElementById('join-form');
    const userNameInput = document.getElementById('user-name');
    const roomIdInput = document.getElementById('room-id');
    const generateRoomBtn = document.getElementById('generate-room');
    const defaultRoomCheckbox = document.getElementById('default-room');
    const qrSection = document.getElementById('qr-section');
    const qrcodeContainer = document.getElementById('qrcode');
    const roomUrlDisplay = document.getElementById('room-url');
    
    const messagesContainer = document.getElementById('messages-container');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const fileBtn = document.getElementById('file-btn');
    const fileInput = document.getElementById('file-input');
    const usersList = document.getElementById('users-list');
    const currentRoomDisplay = document.getElementById('current-room');
    const typingIndicator = document.getElementById('typing-indicator');
    const typingText = document.getElementById('typing-text');
    const dragOverlay = document.getElementById('drag-overlay');
    const leaveRoomBtn = document.getElementById('leave-room');
    const themeToggle = document.getElementById('theme-toggle');
    const showQrBtn = document.getElementById('show-qr-btn');
    const userCountDisplay = document.getElementById('user-count');
    const scrollDownBtn = document.getElementById('scroll-down-btn');
    const newMessagesBadge = document.getElementById('new-messages-badge');
    
    const qrModal = document.getElementById('qr-modal');
    const closeQrBtn = document.getElementById('close-qr');
    const modalQrcode = document.getElementById('modal-qrcode');
    const modalRoomUrl = document.getElementById('modal-room-url');
    const copyUrlBtn = document.getElementById('copy-url');
    
    const fileModal = document.getElementById('file-modal');
    const closeFileModalBtn = document.getElementById('close-file-modal');
    const fileModalName = document.getElementById('file-modal-name');
    const fileModalContent = document.getElementById('file-modal-content');
    const fileModalDownload = document.getElementById('file-modal-download');
    const toastContainer = document.getElementById('toast-container');
    
    // Image Modal Elements
    const imageModal = document.getElementById('image-modal');
    const closeImageModalBtn = document.getElementById('close-image-modal');
    const modalImage = document.getElementById('modal-image');
    const modalImageName = document.getElementById('modal-image-name');
    const modalImageDownload = document.getElementById('modal-image-download');

    // Initialize
    function init() {
        setupTheme();
        setupEventListeners();
        setupScrollListener();
        checkUrlParams();
        autoResizeTextarea();
    }

    // Theme Management
    function setupTheme() {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    function toggleTheme() {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    }

    // URL Parameter Check
    function checkUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const room = params.get('room');
        if (room) {
            roomIdInput.value = room;
        }
    }

    // QR Code Generation
    function generateQRCode(container, text) {
        container.innerHTML = '';
        try {
            new QRCode(container, {
                text: text,
                width: 180,
                height: 180,
                colorDark: document.documentElement.classList.contains('dark') ? '#f1f5f9' : '#0f172a',
                colorLight: document.documentElement.classList.contains('dark') ? '#1e293b' : '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            });
        } catch (e) {
            console.error('QR Code generation failed:', e);
        }
    }

    function getRoomUrl(roomId) {
        const url = new URL(window.location.href);
        url.searchParams.set('room', roomId);
        return url.toString();
    }

    function updateQRCode() {
        const roomId = roomIdInput.value.trim();
        if (roomId) {
            const url = getRoomUrl(roomId);
            generateQRCode(qrcodeContainer, url);
            roomUrlDisplay.textContent = url;
            qrSection.classList.remove('hidden');
        } else {
            qrSection.classList.add('hidden');
        }
    }

    // Room Generation
    function generateRoomId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 12; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Socket.IO Connection
    function connectSocket() {
        socket = io();
        
        socket.on('connect', () => {
            console.log('Connected to server');
        });
        
        socket.on('disconnect', () => {
            showToast('Disconnected from server', 'error');
        });
        
        socket.on('error', (data) => {
            showToast(data.message, 'error');
        });
        
        socket.on('joined-room', (data) => {
            showChatInterface(data);
        });
        
        socket.on('user-joined', (data) => {
            addSystemMessage(`${data.name} joined the room`);
            addUserToList(data.name); // Add user to sidebar
            if (data.userCount) updateUserCount(data.userCount);
            playNotificationSound();
        });
        
        socket.on('user-left', (data) => {
            addSystemMessage(`${data.name} left the room`);
            removeUserFromList(data.name);
            if (data.userCount) updateUserCount(data.userCount);
        });
        
        socket.on('new-message', (message) => {
            addMessage(message);
            if (message.sender !== currentUser) {
                playNotificationSound();
            }
            handleNewMessageScroll();
        });
        
        socket.on('typing', (data) => {
            if (data.name !== currentUser) {
                showTypingIndicator(data.name, data.isTyping);
            }
        });
    }

    // UI Transitions
    function showChatInterface(data) {
        loginScreen.classList.add('hidden');
        chatInterface.classList.remove('hidden');
        currentRoomDisplay.textContent = data.roomId;
        
        // Add self to users list
        addUserToList(currentUser, true);
        
        // Update user count
        if (data.userCount) updateUserCount(data.userCount);
        
        // Add existing users
        data.users.forEach(user => addUserToList(user));
        
        // Add welcome message
        addSystemMessage(data.message);
        
        // Focus input
        messageInput.focus();
        
        // Update URL
        const url = new URL(window.location.href);
        url.searchParams.set('room', data.roomId);
        window.history.replaceState({}, '', url);
    }

    function leaveRoom() {
        if (socket) {
            socket.disconnect();
        }
        
        // Reset state
        currentUser = null;
        currentRoom = null;
        usersList.innerHTML = '';
        messagesContainer.innerHTML = '';
        
        // Show login screen
        chatInterface.classList.add('hidden');
        loginScreen.classList.remove('hidden');
        
        // Clear URL
        const url = new URL(window.location.href);
        url.searchParams.delete('room');
        window.history.replaceState({}, '', url);
        
        // Reset form
        userNameInput.value = '';
        roomIdInput.value = '';
        defaultRoomCheckbox.checked = false;
        qrSection.classList.add('hidden');
    }

    // Message Handling
    function addMessage(message) {
        const messageEl = document.createElement('div');
        const isOwn = message.sender === currentUser;
        const msgId = 'msg-' + (++messageIdCounter);
        messageEl.id = msgId;
        messageEl.className = `flex ${isOwn ? 'justify-end' : 'justify-start'} animate-fade-in group`;
        messageEl.style.animation = 'fadeIn 0.2s ease-out';
        
        let content = '';
        let copyButton = '';
        
        if (message.type === 'file') {
            content = renderFileMessage(message);
        } else {
            content = renderTextMessage(message);
            // Add copy button only for received text messages (not own messages)
            if (!isOwn) {
                copyButton = `
                    <button data-copy-id="${msgId}" 
                            class="copy-btn absolute -right-8 top-0 p-1.5 text-gray-400 hover:text-[#25D366] opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Copy message">
                        <i class="fa-regular fa-copy"></i>
                    </button>
                `;
            }
        }
        
        messageEl.innerHTML = `
            <div class="relative max-w-[85%] md:max-w-[70%] ${isOwn 
                ? 'bg-[#DCF8C6] dark:bg-[#005C4B] text-gray-900 dark:text-white border-[#b9e88a] dark:border-[#005C4B]' 
                : 'bg-white dark:bg-dark-card text-gray-900 dark:text-dark-text border-gray-200 dark:border-dark-border'} 
                          rounded-2xl px-4 py-3 shadow-sm border">
                ${!isOwn ? `<p class="text-xs font-medium text-[#25D366] dark:text-[#66bb6a] mb-1">${escapeHtml(message.sender)}</p>` : ''}
                ${content}
                <p class="text-xs ${isOwn ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-dark-muted'} mt-1 text-right">
                    ${formatTime(message.timestamp)}
                </p>
                ${copyButton}
            </div>
        `;
        
        // Store message text for copying
        if (message.type !== 'file') {
            messageEl.dataset.messageText = message.text;
        }
        
        messagesContainer.appendChild(messageEl);
    }

    function renderTextMessage(message) {
        // Parse markdown
        const rawHtml = marked.parse(message.text, {
            breaks: true,
            gfm: true,
            headerIds: false,
            mangle: false
        });
        
        // Sanitize
        const cleanHtml = DOMPurify.sanitize(rawHtml, {
            ALLOWED_TAGS: [
                'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'strike', 'del', 'a', 'code', 'pre',
                'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'hr',
                'table', 'thead', 'tbody', 'tr', 'th', 'td'
            ],
            ALLOWED_ATTR: ['href', 'target', 'rel']
        });
        
        return `<div class="message-content text-sm">${cleanHtml}</div>`;
    }

    function renderFileMessage(message) {
        const isImage = message.fileType?.startsWith('image/');
        const isVideo = message.fileType?.startsWith('video/');
        const isCodeFile = ['text/plain', 'text/html', 'text/javascript', 'application/javascript', 'text/css'].includes(message.fileType);
        const isPDF = message.fileType === 'application/pdf' || message.fileName?.toLowerCase().endsWith('.pdf');
        const isExcel = message.fileType?.includes('excel') || message.fileType === 'application/vnd.ms-excel' || 
                        message.fileName?.toLowerCase().match(/\.(xlsx?|xlsm)$/);
        
        if (isImage) {
            // Store image data for click handler
            const imgId = 'img-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            // Create a temporary storage for this image
            if (!window.imageStore) window.imageStore = {};
            window.imageStore[imgId] = {
                src: message.fileData,
                name: message.fileName
            };
            return `
                <div class="message-content">
                    <img src="${message.fileData}" 
                         alt="${escapeHtml(message.fileName)}" 
                         class="rounded-lg"
                         data-img-id="${imgId}"
                         loading="lazy">
                </div>
            `;
        } else if (isVideo) {
            return `
                <div class="message-content">
                    <video controls class="max-w-full rounded-lg" style="max-height: 300px;">
                        <source src="${message.fileData}" type="${message.fileType}">
                        Your browser does not support the video tag.
                    </video>
                    <p class="text-xs mt-2 opacity-80">${escapeHtml(message.fileName)}</p>
                </div>
            `;
        } else if (isPDF) {
            return `
                <div class="message-content">
                    <div class="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <i class="fa-solid fa-file-pdf text-3xl text-red-500"></i>
                        <div class="min-w-0">
                            <p class="font-medium text-sm truncate">${escapeHtml(message.fileName)}</p>
                            <p class="text-xs opacity-70">${formatFileSize(message.fileSize)}</p>
                        </div>
                    </div>
                    <div class="flex gap-2 mt-2">
                        <a href="${message.fileData}" target="_blank" 
                           class="flex-1 text-center py-2 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg transition-colors">
                            <i class="fa-solid fa-eye mr-1"></i> View
                        </a>
                        <a href="${message.fileData}" download="${escapeHtml(message.fileName)}"
                           class="flex-1 text-center py-2 bg-gray-200 dark:bg-dark-border hover:bg-gray-300 dark:hover:bg-gray-600 text-sm rounded-lg transition-colors">
                            <i class="fa-solid fa-download mr-1"></i> Download
                        </a>
                    </div>
                </div>
            `;
        } else if (isExcel) {
            return `
                <div class="message-content">
                    <div class="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <i class="fa-solid fa-file-excel text-3xl text-green-600"></i>
                        <div class="min-w-0">
                            <p class="font-medium text-sm truncate">${escapeHtml(message.fileName)}</p>
                            <p class="text-xs opacity-70">${formatFileSize(message.fileSize)}</p>
                        </div>
                    </div>
                    <a href="${message.fileData}" download="${escapeHtml(message.fileName)}"
                       class="block mt-2 text-center py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors">
                        <i class="fa-solid fa-download mr-1"></i> Download Excel File
                    </a>
                </div>
            `;
        } else if (isCodeFile) {
            // For code files, show a preview with syntax highlighting style
            const ext = message.fileName.split('.').pop()?.toLowerCase();
            const langClass = ext === 'js' || ext === 'javascript' ? 'language-javascript' :
                             ext === 'html' || ext === 'htm' ? 'language-html' :
                             ext === 'css' ? 'language-css' : 'language-text';
            
            return `
                <div class="message-content">
                    <div class="flex items-center gap-2 mb-2 p-2 bg-black/10 rounded-lg">
                        <i class="fa-solid fa-file-code"></i>
                        <span class="font-mono text-sm">${escapeHtml(message.fileName)}</span>
                    </div>
                    <button onclick="window.devRelay.viewCodeFile('${message.id}', '${escapeHtml(message.fileName)}', '${message.fileType}')"
                            class="text-sm underline hover:no-underline opacity-90">
                        View file contents
                    </button>
                    <a href="${message.fileData}" download="${escapeHtml(message.fileName)}"
                       class="block mt-2 text-sm opacity-80 hover:opacity-100">
                        <i class="fa-solid fa-download mr-1"></i> Download (${formatFileSize(message.fileSize)})
                    </a>
                </div>
            `;
        } else {
            return `
                <div class="message-content">
                    <div class="flex items-center gap-2">
                        <i class="fa-solid fa-file text-2xl"></i>
                        <div>
                            <p class="font-medium text-sm">${escapeHtml(message.fileName)}</p>
                            <p class="text-xs opacity-70">${formatFileSize(message.fileSize)}</p>
                        </div>
                    </div>
                    <a href="${message.fileData}" download="${escapeHtml(message.fileName)}"
                       class="block mt-2 text-sm opacity-80 hover:opacity-100">
                        <i class="fa-solid fa-download mr-1"></i> Download
                    </a>
                </div>
            `;
        }
    }

    function addSystemMessage(text) {
        const messageEl = document.createElement('div');
        messageEl.className = 'flex justify-center';
        messageEl.innerHTML = `
            <span class="px-3 py-1 bg-gray-200 dark:bg-dark-border text-gray-600 dark:text-dark-muted text-xs rounded-full">
                ${escapeHtml(text)}
            </span>
        `;
        messagesContainer.appendChild(messageEl);
        scrollToBottom();
    }

    function addUserToList(name, isSelf = false) {
        const li = document.createElement('li');
        li.className = 'flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border';
        li.dataset.name = name;
        li.innerHTML = `
            <span class="w-2 h-2 rounded-full ${isSelf ? 'bg-[#25D366]' : 'bg-[#128C7E]'}"></span>
            <span class="text-sm font-medium ${isSelf ? 'text-[#25D366]' : ''}">
                ${escapeHtml(name)} ${isSelf ? '(You)' : ''}
            </span>
        `;
        usersList.appendChild(li);
    }

    function updateUserCount(count) {
        if (userCountDisplay) {
            userCountDisplay.textContent = count;
        }
    }

    // Typing Indicator
    function showTypingIndicator(name, isTyping) {
        if (isTyping) {
            typingText.textContent = `${name} is typing`;
            typingIndicator.classList.remove('hidden');
        } else {
            typingIndicator.classList.add('hidden');
        }
    }

    function handleTyping() {
        if (!isTyping) {
            isTyping = true;
            socket.emit('typing', { isTyping: true });
        }
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            isTyping = false;
            socket.emit('typing', { isTyping: false });
        }, 1000);
    }

    // File Handling
    async function handleFile(file) {
        if (file.size > 10 * 1024 * 1024) {
            showToast('File too large (max 10MB)', 'error');
            return;
        }
        
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
            'video/mp4', 'video/webm', 'video/quicktime',
            'text/plain', 'text/html', 'text/javascript', 'application/javascript',
            'text/css', 'application/json', 'text/markdown',
            'application/pdf',
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel.sheet.macroEnabled.12'
        ];
        
        const allowedExts = ['.txt', '.html', '.htm', '.js', '.json', '.css', '.md', '.markdown',
                               '.pdf', '.xls', '.xlsx', '.xlsm',
                               '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.mp4', '.webm', '.mov'];
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        
        if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext)) {
            showToast('File type not allowed', 'error');
            return;
        }
        
        try {
            const base64 = await fileToBase64(file);
            socket.emit('send-file', {
                name: file.name,
                type: file.type || 'application/octet-stream',
                size: file.size,
                data: base64
            });
            showToast('File sent!', 'success');
        } catch (err) {
            showToast('Failed to send file', 'error');
            console.error(err);
        }
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // Drag and Drop
    function setupDragAndDrop() {
        const events = ['dragenter', 'dragover', 'dragleave', 'drop'];
        
        events.forEach(eventName => {
            document.body.addEventListener(eventName, preventDefaults, false);
        });
        
        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        ['dragenter', 'dragover'].forEach(eventName => {
            document.body.addEventListener(eventName, () => {
                if (!chatInterface.classList.contains('hidden')) {
                    dragOverlay.classList.remove('hidden');
                }
            }, false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            dragOverlay.addEventListener(eventName, (e) => {
                if (e.target === dragOverlay) {
                    dragOverlay.classList.add('hidden');
                }
            }, false);
        });
        
        dragOverlay.addEventListener('drop', handleDrop, false);
    }

    function handleDrop(e) {
        dragOverlay.classList.add('hidden');
        const files = e.dataTransfer.files;
        
        if (files.length > 0) {
            Array.from(files).forEach(file => handleFile(file));
        }
    }

    // Clipboard Paste
    function handlePaste(e) {
        const items = e.clipboardData?.items;
        if (!items) return;
        
        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                e.preventDefault();
                const blob = item.getAsFile();
                if (blob) {
                    const file = new File([blob], `pasted-image-${Date.now()}.png`, { type: 'image/png' });
                    showPendingFile(file);
                }
            }
        }
    }

    function showPendingFile(file) {
        // Store the pending file
        pendingFile = file;
        
        // Create or update pending file preview
        let previewContainer = document.getElementById('pending-file-container');
        if (!previewContainer) {
            previewContainer = document.createElement('div');
            previewContainer.id = 'pending-file-container';
            previewContainer.className = 'pending-file';
            
            // Insert after textarea container (inside the same parent as textarea)
            const textareaContainer = messageInput.parentElement;
            textareaContainer.appendChild(previewContainer);
        }
        
        // Create preview
        const reader = new FileReader();
        reader.onload = (e) => {
            previewContainer.innerHTML = `
                <div class="flex items-center gap-2 flex-1">
                    <img src="${e.target.result}" class="w-10 h-10 object-cover rounded" alt="preview">
                    <span class="text-sm text-gray-600 dark:text-gray-300 truncate">${escapeHtml(file.name)}</span>
                </div>
                <button id="clear-pending-btn" class="p-1 text-gray-500 hover:text-red-500" title="Remove">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `;
            
            // Add event listener to the clear button
            const clearBtn = document.getElementById('clear-pending-btn');
            if (clearBtn) {
                clearBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    clearPendingFile();
                });
            }
        };
        reader.readAsDataURL(file);
        
        showToast('Image ready to send. Press Enter or click send.', 'info');
    }

    function clearPendingFile() {
        pendingFile = null;
        const previewContainer = document.getElementById('pending-file-container');
        if (previewContainer) {
            previewContainer.remove();
        }
    }

    // Global image click handler
    document.addEventListener('click', function(e) {
        const img = e.target.closest('.message-content img');
        if (img) {
            const imgId = img.dataset.imgId;
            if (imgId && window.imageStore && window.imageStore[imgId]) {
                const imgData = window.imageStore[imgId];
                openImageModal(imgData.src, imgData.name);
            } else {
                // Fallback - use the src directly
                openImageModal(img.src, 'Image');
            }
        }
    });

    // Global copy button click handler (event delegation)
    document.addEventListener('click', function(e) {
        const copyBtn = e.target.closest('.copy-btn');
        if (copyBtn) {
            e.preventDefault();
            e.stopPropagation();
            const msgId = copyBtn.dataset.copyId;
            if (msgId) {
                copyMessage(msgId);
            }
        }
    });

    function copyMessage(msgId) {
        const msgEl = document.getElementById(msgId);
        if (!msgEl) {
            showToast('Message not found', 'error');
            return;
        }
        
        const messageText = msgEl.dataset.messageText;
        if (!messageText) {
            showToast('No text to copy', 'error');
            return;
        }
        
        // Try modern clipboard API first (works on HTTPS and localhost)
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(messageText).then(() => {
                showToast('Message copied!', 'success');
            }).catch((err) => {
                console.error('Clipboard API failed:', err);
                fallbackCopy(messageText);
            });
        } else {
            // Use fallback for non-secure contexts (HTTP over IP)
            fallbackCopy(messageText);
        }
    }
    
    // Fallback copy method using execCommand
    function fallbackCopy(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            const successful = document.execCommand('copy');
            if (successful) {
                showToast('Message copied!', 'success');
            } else {
                showToast('Copy failed - please copy manually', 'error');
            }
        } catch (err) {
            console.error('Fallback copy failed:', err);
            showToast('Copy not supported in this browser', 'error');
        }
        
        document.body.removeChild(textArea);
    }

    function openImageModal(src, name) {
        modalImage.src = src;
        modalImageName.textContent = name;
        modalImageDownload.href = src;
        modalImageDownload.download = name;
        imageModal.classList.remove('hidden');
    }

    function closeImageModal() {
        imageModal.classList.add('hidden');
        modalImage.src = '';
    }

    function viewCodeFile(messageId, fileName, fileType) {
        // Find the message with this ID
        const message = Array.from(messagesContainer.querySelectorAll('[data-message-id]')).find(
            el => el.dataset.messageId === messageId
        );
        
        // Actually, we need to get the file data - for now, we can't retrieve it from DOM
        // Let's modify the approach to store file data when receiving
        showToast('File preview feature - download to view', 'info');
    }

    // Send Message
    function sendMessage() {
        const text = messageInput.value.trim();
        
        // Send pending file if exists
        if (pendingFile) {
            handleFile(pendingFile);
            clearPendingFile();
            // Clear textarea as well
            messageInput.value = '';
            messageInput.style.height = 'auto';
            return;
        }
        
        // Send text message
        if (!text || !socket) return;
        
        socket.emit('send-message', { text, type: 'text' });
        messageInput.value = '';
        messageInput.style.height = 'auto';
        
        // Clear typing indicator
        if (isTyping) {
            isTyping = false;
            socket.emit('typing', { isTyping: false });
        }
    }

    // Utilities
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function scrollToBottom(smooth = false) {
        if (smooth) {
            messagesContainer.scrollTo({
                top: messagesContainer.scrollHeight,
                behavior: 'smooth'
            });
        } else {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    function isScrolledNearBottom() {
        const threshold = 100; // pixels from bottom
        const position = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight;
        return position < threshold;
    }

    function handleNewMessageScroll() {
        if (isNearBottom) {
            scrollToBottom(true);
        } else {
            unreadCount++;
            showScrollDownButton();
        }
    }

    function showScrollDownButton() {
        if (scrollDownBtn) {
            scrollDownBtn.classList.remove('hidden');
            scrollDownBtn.className = 'absolute bottom-24 right-6 p-3 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-full shadow-lg transition-all transform hover:scale-110 z-10';
            if (newMessagesBadge && unreadCount > 0) {
                newMessagesBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                newMessagesBadge.classList.remove('hidden');
            }
        }
    }

    function hideScrollDownButton() {
        if (scrollDownBtn) {
            scrollDownBtn.classList.add('hidden');
            unreadCount = 0;
            if (newMessagesBadge) {
                newMessagesBadge.classList.add('hidden');
            }
        }
    }

    function setupScrollListener() {
        messagesContainer.addEventListener('scroll', () => {
            isNearBottom = isScrolledNearBottom();
            if (isNearBottom) {
                hideScrollDownButton();
            }
        });

        if (scrollDownBtn) {
            scrollDownBtn.addEventListener('click', () => {
                scrollToBottom(true);
                hideScrollDownButton();
            });
        }
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        const colors = {
            info: 'bg-[#25D366]',
            success: 'bg-[#128C7E]',
            error: 'bg-red-500'
        };
        const icons = {
            info: 'fa-info-circle',
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle'
        };
        
        toast.className = `${colors[type]} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 pointer-events-auto transform transition-all duration-300 translate-y-0 opacity-100`;
        toast.innerHTML = `<i class="fa-solid ${icons[type]}"></i> <span>${escapeHtml(message)}</span>`;
        
        toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function playNotificationSound() {
        // Optional: Add a subtle notification sound
        // const audio = new Audio('notification.mp3');
        // audio.volume = 0.3;
        // audio.play().catch(() => {});
    }

    function autoResizeTextarea() {
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
            
            // Update character count
            const count = document.getElementById('character-count');
            if (count) {
                count.textContent = `${this.value.length}/50000`;
                count.classList.remove('hidden');
            }
        });
    }

    // Event Listeners
    function setupEventListeners() {
        // Join form
        joinForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const name = userNameInput.value.trim();
            let room = roomIdInput.value.trim();
            
            if (!name) {
                showToast('Please enter your name', 'error');
                return;
            }
            
            if (defaultRoomCheckbox.checked) {
                room = 'dev-room';
            }
            
            if (!room) {
                showToast('Please enter a room ID', 'error');
                return;
            }
            
            currentUser = name;
            currentRoom = room;
            
            connectSocket();
            socket.emit('join-room', { roomId: room, name });
        });

        // Generate room
        generateRoomBtn.addEventListener('click', () => {
            roomIdInput.value = generateRoomId();
            defaultRoomCheckbox.checked = false;
            updateQRCode();
        });

        // Room ID change
        roomIdInput.addEventListener('input', updateQRCode);

        // Default room checkbox
        defaultRoomCheckbox.addEventListener('change', () => {
            if (defaultRoomCheckbox.checked) {
                roomIdInput.value = 'dev-room';
                roomIdInput.setAttribute('readonly', 'readonly');
                updateQRCode();
            } else {
                roomIdInput.value = '';
                roomIdInput.removeAttribute('readonly');
                roomIdInput.focus();
            }
        });

        // Send message
        sendBtn.addEventListener('click', sendMessage);
        
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
            
            if (e.key !== 'Enter' && e.key !== 'Shift') {
                handleTyping();
            }
        });

        // File upload
        fileBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            Array.from(e.target.files).forEach(file => handleFile(file));
            fileInput.value = '';
        });

        // Drag and drop
        setupDragAndDrop();

        // Clipboard paste
        document.addEventListener('paste', handlePaste);

        // Theme toggle
        themeToggle.addEventListener('click', toggleTheme);

        // Leave room
        leaveRoomBtn.addEventListener('click', leaveRoom);

        // QR Code
        showQrBtn.addEventListener('click', () => {
            const url = getRoomUrl(currentRoom);
            generateQRCode(modalQrcode, url);
            modalRoomUrl.textContent = url;
            qrModal.classList.remove('hidden');
        });

        closeQrBtn.addEventListener('click', () => qrModal.classList.add('hidden'));
        qrModal.addEventListener('click', (e) => {
            if (e.target === qrModal) qrModal.classList.add('hidden');
        });

        copyUrlBtn.addEventListener('click', () => {
            const url = modalRoomUrl.textContent;
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(url).then(() => {
                    showToast('Link copied!', 'success');
                }).catch(() => {
                    fallbackCopy(url);
                });
            } else {
                fallbackCopy(url);
            }
        });

        // File modal
        closeFileModalBtn.addEventListener('click', () => fileModal.classList.add('hidden'));
        fileModal.addEventListener('click', (e) => {
            if (e.target === fileModal) fileModal.classList.add('hidden');
        });

        // Image modal events
        closeImageModalBtn.addEventListener('click', closeImageModal);
        imageModal.addEventListener('click', (e) => {
            if (e.target === imageModal) closeImageModal();
        });

        // Escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                qrModal.classList.add('hidden');
                fileModal.classList.add('hidden');
                closeImageModal();
            }
        });
    }

    // Expose functions for onclick handlers
    window.devRelay = {
        viewCodeFile,
        copyMessage,
        clearPendingFile
    };

    // Add fade-in animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
            animation: fadeIn 0.2s ease-out;
        }
    `;
    document.head.appendChild(style);

    // Initialize
    init();
})();
