const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Device Hub Pro Server (File + Location + Control) is Active!');
});

// ৫০ এমবি পর্যন্ত ফাইল ট্রান্সফার সাপোর্ট
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 50 * 1024 * 1024
});

const devices = new Map();

io.on('connection', (socket) => {
  console.log('নতুন ডিভাইস সংযুক্ত হয়েছে:', socket.id);

  // ডিভাইসের ব্যাটারি, লোকেশন ও স্ট্যাটাস আপডেট
  socket.on('update_device', (data) => {
    devices.set(socket.id, {
      socketId: socket.id,
      id: data.id,
      name: data.name,
      battery: data.battery,
      isCharging: data.isCharging,
      isRinging: data.isRinging,
      isLocked: data.isLocked,
      location: data.location || 'Unknown',
      coordinates: data.coordinates || '0.0, 0.0',
      ip: data.ip || '',
      isp: data.isp || ''
    });
    io.emit('device_list', Array.from(devices.values()));
  });

  // কমান্ড পাঠানো (রিং, মেসেজ, লক, ফাইল লিস্ট, ফাইল সেভ/ডাউনলোড)
  socket.on('send_command', (cmd) => {
    const { targetId, sender, senderId, action, payload } = cmd;
    console.log(`কমান্ড: ${action} | প্রেরক: ${sender} -> টার্গেট: ${targetId}`);

    if (targetId === 'ALL') {
      io.emit('execute_command', { action, sender, senderId, payload });
    } else {
      for (const [sockId, dev] of devices.entries()) {
        if (dev.id === targetId) {
          io.to(sockId).emit('execute_command', { action, sender, senderId, payload });
        }
      }
    }
  });

  // ফাইল লিস্ট এবং ডাউনলোড করা ফাইল মেইন ফোনে পৌঁছে দেওয়া
  socket.on('file_response', (res) => {
    const { targetId } = res;
    for (const [sockId, dev] of devices.entries()) {
      if (dev.id === targetId) {
        io.to(sockId).emit('receive_file_response', res);
      }
    }
  });

  socket.on('disconnect', () => {
    devices.delete(socket.id);
    io.emit('device_list', Array.from(devices.values()));
    console.log('ডিভাইস বিচ্ছিন্ন হয়েছে:', socket.id);
  });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`Device Hub Pro Server চালু হয়েছে পোর্ট: ${PORT}`);
  console.log(`===============================================`);
});