const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const path = require('path');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 10 * 1024 * 1024 // 10MB max file size
});

// Security middleware - relaxed for local network access
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'", "http:", "https:", "ws:", "wss:", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:", "cdn.tailwindcss.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https:", "cdn.tailwindcss.com", "cdnjs.cloudflare.com", "cdn.jsdelivr.net"],
      scriptSrcAttr: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
      fontSrc: ["'self'", "https:", "cdnjs.cloudflare.com"],
      formAction: ["'self'", "http:", "https:"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// In-memory storage (no database)
const rooms = new Map();
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Allowed MIME types for security
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'video/mp4', 'video/webm', 'video/quicktime',
  'text/plain', 'text/html', 'text/javascript', 'application/javascript',
  'text/css', 'application/json', 'text/markdown',
  'application/pdf',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12'
];

// File extension to MIME type mapping
const FILE_EXTENSION_MAP = {
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.md': 'text/markdown',
  '.pdf': 'application/pdf',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime'
};

function validateMimeType(filename, mimeType) {
  const ext = path.extname(filename).toLowerCase();
  const expectedType = FILE_EXTENSION_MAP[ext];
  
  // Check if extension is allowed
  if (!expectedType) {
    return { valid: false, message: 'File type not allowed' };
  }
  
  // For text-based files, be more lenient with MIME type checking
  if (ext === '.js' && (mimeType === 'text/javascript' || mimeType === 'application/javascript')) {
    return { valid: true };
  }
  
  if (ALLOWED_MIME_TYPES.includes(mimeType) || mimeType === expectedType) {
    return { valid: true };
  }
  
  return { valid: false, message: 'MIME type mismatch' };
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  // Remove control characters and limit length
  return input.replace(/[<>]/g, '').substring(0, 1000).trim();
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let userName = null;

  socket.on('join-room', (data) => {
    const { roomId, name } = data;
    
    if (!roomId || !name) {
      socket.emit('error', { message: 'Room ID and name are required' });
      return;
    }
    
    // Sanitize inputs
    const sanitizedRoomId = sanitizeInput(roomId);
    const sanitizedName = sanitizeInput(name);
    
    if (!sanitizedRoomId || !sanitizedName) {
      socket.emit('error', { message: 'Invalid room ID or name' });
      return;
    }
    
    // Leave previous room if any
    if (currentRoom) {
      socket.leave(currentRoom);
      const room = rooms.get(currentRoom);
      if (room) {
        room.users = room.users.filter(u => u.id !== socket.id);
        socket.to(currentRoom).emit('user-left', { name: userName });
      }
    }
    
    // Join new room
    currentRoom = sanitizedRoomId;
    userName = sanitizedName;
    socket.join(currentRoom);
    
    // Initialize room if doesn't exist
    if (!rooms.has(currentRoom)) {
      rooms.set(currentRoom, {
        users: [],
        createdAt: Date.now()
      });
    }
    
    const room = rooms.get(currentRoom);
    room.users.push({ id: socket.id, name: userName });
    
    // Notify others in room with user count
    socket.to(currentRoom).emit('user-joined', { name: userName, userCount: room.users.length });
    
    // Send room info to user
    const otherUsers = room.users.filter(u => u.id !== socket.id).map(u => u.name);
    socket.emit('joined-room', {
      roomId: currentRoom,
      users: otherUsers,
      userCount: room.users.length,
      message: `Joined room "${currentRoom}" as "${userName}"`
    });
    
    console.log(`${userName} joined room: ${currentRoom}`);
  });

  socket.on('typing', (data) => {
    if (!currentRoom || !userName) return;
    socket.to(currentRoom).emit('typing', { name: userName, isTyping: data.isTyping });
  });

  socket.on('send-message', (data) => {
    if (!currentRoom || !userName) {
      socket.emit('error', { message: 'Not in a room' });
      return;
    }
    
    const { text, type = 'text' } = data;
    
    if (!text || typeof text !== 'string') {
      socket.emit('error', { message: 'Invalid message' });
      return;
    }
    
    // Limit message size
    const sanitizedText = text.substring(0, 50000); // 50KB max
    
    const message = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      sender: userName,
      text: sanitizedText,
      type: type,
      timestamp: Date.now()
    };
    
    // Broadcast to room (including sender for confirmation)
    io.to(currentRoom).emit('new-message', message);
    
    // Clear typing indicator
    socket.to(currentRoom).emit('typing', { name: userName, isTyping: false });
  });

  socket.on('send-file', (data) => {
    if (!currentRoom || !userName) {
      socket.emit('error', { message: 'Not in a room' });
      return;
    }
    
    const { name, type, size, data: fileData } = data;
    
    if (!name || !fileData) {
      socket.emit('error', { message: 'Invalid file data' });
      return;
    }
    
    // Check file size
    if (size > MAX_FILE_SIZE) {
      socket.emit('error', { message: 'File too large (max 10MB)' });
      return;
    }
    
    // Validate MIME type
    const mimeValidation = validateMimeType(name, type);
    if (!mimeValidation.valid) {
      socket.emit('error', { message: mimeValidation.message });
      return;
    }
    
    const fileMessage = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      sender: userName,
      type: 'file',
      fileName: sanitizeInput(name),
      fileType: type,
      fileSize: size,
      fileData: fileData, // Base64 encoded
      timestamp: Date.now()
    };
    
    io.to(currentRoom).emit('new-message', fileMessage);
  });

  socket.on('disconnect', () => {
    if (currentRoom && userName) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.users = room.users.filter(u => u.id !== socket.id);
        socket.to(currentRoom).emit('user-left', { name: userName, userCount: room.users.length });
        
        // Clean up empty rooms after 1 hour
        if (room.users.length === 0) {
          setTimeout(() => {
            const currentRoomData = rooms.get(currentRoom);
            if (currentRoomData && currentRoomData.users.length === 0) {
              rooms.delete(currentRoom);
              console.log(`Cleaned up empty room: ${currentRoom}`);
            }
          }, 3600000); // 1 hour
        }
      }
    }
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Real-time Relay Server running on port ${PORT}`);
  console.log(`📱 Open http://localhost:${PORT} to access the app`);
  console.log(`🌐 Network access: http://<your-ip>:${PORT}`);
  console.log(`   (Find your IP with: ipconfig on Windows, ifconfig on Mac/Linux)`);
});
