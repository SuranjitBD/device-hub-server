const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Device Hub Pro CCTV & Usage Server is Active!');
});

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
  pingInterval: 25000
});

let devices = {};
let globalEmergencyPin = "1234";

io.on('connection', (socket) => {
  console.log('নতুন ডিভাইস যুক্ত হয়েছে:', socket.id);

  socket.on('register_device', (data) => {
    devices[socket.id] = {
      id: socket.id,
      name: data.name || 'Unknown Device',
      isAdmin: data.isAdmin || false,
      battery: data.battery ?? 100,
      isCharging: data.isCharging ?? false,
      ip: data.ip || 'Unknown IP',
      lat: data.lat || null,
      lng: data.lng || null,
      address: data.address || 'লোকেশন খোঁজা হচ্ছে...',
      isLocked: data.isLocked || false,
      appUsage: data.appUsage || [],
      lastSeen: new Date().toLocaleTimeString()
    };
    io.emit('device_list', Object.values(devices));
  });

  socket.on('update_device_status', (data) => {
    if (devices[socket.id]) {
      devices[socket.id].battery = data.battery ?? devices[socket.id].battery;
      devices[socket.id].isCharging = data.isCharging ?? devices[socket.id].isCharging;
      devices[socket.id].lat = data.lat ?? devices[socket.id].lat;
      devices[socket.id].lng = data.lng ?? devices[socket.id].lng;
      devices[socket.id].address = data.address || devices[socket.id].address;
      devices[socket.id].appUsage = data.appUsage || devices[socket.id].appUsage;
      io.emit('device_list', Object.values(devices));
    }
  });

  socket.on('start_cctv', (targetId) => {
    io.to(targetId).emit('command_start_cctv', { adminId: socket.id });
  });

  socket.on('stop_cctv', (targetId) => {
    io.to(targetId).emit('command_stop_cctv');
  });

  socket.on('cctv_frame_from_child', (data) => {
    if (data.adminId) io.to(data.adminId).emit('cctv_frame_to_admin', data.frame);
  });

  socket.on('capture_photo', (targetId) => {
    io.to(targetId).emit('command_capture_photo', { adminId: socket.id });
  });

  socket.on('photo_captured', (data) => {
    io.to(data.adminId).emit('receive_captured_photo', data);
  });

  socket.on('ring_device', (targetId) => {
    if (targetId === 'ALL') socket.broadcast.emit('command_ring');
    else io.to(targetId).emit('command_ring');
  });

  socket.on('stop_ring', (targetId) => {
    if (targetId === 'ALL') socket.broadcast.emit('command_stop_ring');
    else io.to(targetId).emit('command_stop_ring');
  });

  socket.on('lock_device', (data) => {
    const pin = data.pin || globalEmergencyPin;
    globalEmergencyPin = pin;
    if (data.targetId === 'ALL') socket.broadcast.emit('command_lock', { pin });
    else io.to(data.targetId).emit('command_lock', { pin });
  });

  socket.on('unlock_device', (targetId) => {
    if (targetId === 'ALL') socket.broadcast.emit('command_unlock');
    else io.to(targetId).emit('command_unlock');
  });

  socket.on('disconnect', () => {
    delete devices[socket.id];
    io.emit('device_list', Object.values(devices));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
