const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 1e8, // 100 MB পর্যন্ত বড় ফাইল ও ছবি ট্রান্সফারের সাপোর্ট
  pingTimeout: 60000,
  pingInterval: 25000
});

let devices = {};
let globalEmergencyPin = "1234"; // ডিফল্ট পিন, যা এডমিন প্যানেল থেকে পরিবর্তন করা যাবে

app.get('/', (req, res) => {
  res.send('Device Hub Pro Server is Live & Running 24/7!');
});

io.on('connection', (socket) => {
  console.log('নতুন ডিভাইস যুক্ত হয়েছে:', socket.id);

  // ১. ডিভাইস রেজিস্ট্রেশন
  socket.on('register_device', (data) => {
    devices[socket.id] = {
      id: socket.id,
      name: data.name || 'Unknown Device',
      isAdmin: data.isAdmin || false,
      lat: data.lat || null,
      lng: data.lng || null,
      address: data.address || 'লোকেশন খোঁজা হচ্ছে...',
      isLocked: data.isLocked || false,
      currentPath: data.currentPath || '/storage/emulated/0',
      files: data.files || [],
      lastSeen: new Date().toLocaleTimeString()
    };
    io.emit('device_list', Object.values(devices));
  });

  // ২. লোকেশন আপডেট
  socket.on('update_location', (data) => {
    if (devices[socket.id]) {
      devices[socket.id].lat = data.lat;
      devices[socket.id].lng = data.lng;
      devices[socket.id].address = data.address || `${data.lat}, ${data.lng}`;
      io.emit('device_list', Object.values(devices));
    }
  });

  // ৩. রিং বাজানো ও বন্ধ করা
  socket.on('ring_device', (targetId) => {
    if (targetId === 'ALL') {
      socket.broadcast.emit('command_ring');
    } else {
      io.to(targetId).emit('command_ring');
    }
  });

  socket.on('stop_ring', (targetId) => {
    if (targetId === 'ALL') {
      socket.broadcast.emit('command_stop_ring');
    } else {
      io.to(targetId).emit('command_stop_ring');
    }
  });

  // ৪. মেসেজ পাঠানো
  socket.on('send_message', (data) => {
    if (data.targetId === 'ALL') {
      socket.broadcast.emit('command_message', { message: data.message });
    } else {
      io.to(data.targetId).emit('command_message', { message: data.message });
    }
  });

  // ৫. কাস্টম পিনসহ ডিভাইস লক ও আনলক
  socket.on('lock_device', (data) => {
    const pinToUse = data.pin || globalEmergencyPin;
    globalEmergencyPin = pinToUse;

    if (data.targetId === 'ALL') {
      Object.keys(devices).forEach(id => {
        if (id !== socket.id && !devices[id].isAdmin) {
          devices[id].isLocked = true;
        }
      });
      socket.broadcast.emit('command_lock', { pin: pinToUse });
    } else {
      if (devices[data.targetId]) devices[data.targetId].isLocked = true;
      io.to(data.targetId).emit('command_lock', { pin: pinToUse });
    }
    io.emit('device_list', Object.values(devices));
  });

  socket.on('unlock_device', (targetId) => {
    if (targetId === 'ALL') {
      Object.keys(devices).forEach(id => {
        if (devices[id]) devices[id].isLocked = false;
      });
      socket.broadcast.emit('command_unlock');
    } else {
      if (devices[targetId]) devices[targetId].isLocked = false;
      io.to(targetId).emit('command_unlock');
    }
    io.emit('device_list', Object.values(devices));
  });

  socket.on('device_unlocked_by_pin', () => {
    if (devices[socket.id]) {
      devices[socket.id].isLocked = false;
      io.emit('device_list', Object.values(devices));
    }
  });

  // ৬. ফাইল ম্যানেজার: ফাইল লিস্ট, প্রিভিউ, ডিলিট ও প্রোগ্রেসসহ ডাউনলোড
  socket.on('request_files', (data) => {
    io.to(data.targetId).emit('command_get_files', {
      path: data.path,
      adminId: socket.id
    });
  });

  socket.on('files_response', (data) => {
    if (devices[socket.id]) {
      devices[socket.id].currentPath = data.path;
      devices[socket.id].files = data.files;
    }
    if (data.adminId) {
      io.to(data.adminId).emit('receive_files', {
        deviceId: socket.id,
        path: data.path,
        files: data.files
      });
    } else {
      io.emit('device_list', Object.values(devices));
    }
  });

  // ফাইল ডিলিট কমান্ড
  socket.on('delete_file', (data) => {
    io.to(data.targetId).emit('command_delete_file', {
      path: data.path,
      parentPath: data.parentPath,
      adminId: socket.id
    });
  });

  // ফাইল ডাউনলোড রিকোয়েস্ট (চাইল্ড ফোন থেকে এডমিন ফোনে)
  socket.on('download_file', (data) => {
    io.to(data.targetId).emit('command_send_file', {
      path: data.path,
      fileName: data.fileName,
      isPreviewOnly: data.isPreviewOnly || false,
      adminId: socket.id
    });
  });

  // ফাইল চাঙ্ক (Chunk) রিলে - ডাউনলোড প্রোগ্রেস বারের জন্য
  socket.on('file_chunk_from_client', (data) => {
    io.to(data.adminId).emit('file_chunk_to_admin', data);
  });

  socket.on('disconnect', () => {
    delete devices[socket.id];
    io.emit('device_list', Object.values(devices));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log(`Device Hub Pro Server চালু হয়েছে পোর্ট: ${PORT}`);
  console.log('====================================================');
});
