const express    = require('express'),
      low        = require('lowdb'),
      FileAsync  = require('lowdb/adapters/FileAsync'),
      path       = require('path'),
      multer     = require('multer'),
      md5File    = require('md5-file'),
      fs         = require('fs'),
      morgan     = require('morgan'),
      bodyParser = require('body-parser');

const app = express(); // Create server

// middlewares
app.use(morgan('tiny'))
   .use((req, res, next) => {
     res.set('Access-Control-Allow-Origin', '*');
     res.set('Access-Control-Allow-Headers', 'Content-Type');
     next();
   }) // CORS
   .use(bodyParser.json({limit: '50mb'}))
   .use(bodyParser.urlencoded({limit: '50mb', extended: true, parameterLimit: 1000000}))
   .use(express.static(path.join(__dirname, 'static'))); // Statics

const upload = multer({ dest: 'static/uploads/' });
const server = require('http').Server(app);
const io     = require('socket.io')(server);
let   id     = null;

// Create database instance and start server
const adapter = new FileAsync('db.json');

low(adapter)
  .then(db => {
  //Routes

  db.defaults({ device: [], file: [] })
  .write()

  db.get('device')
    .remove()
    .write();

  // GET /devices
  app.get('/devices', (req, res) => {
      const devices = db.get('device').value();
      res.send(devices);
  });

  // POST /device
  app.post('/device', (req, res) => {
      if (db.get('device').find({ device_id: req.body.device_id }).value()) {
        io.to(req.body.device_id).emit('newFile', req.body);
        console.log(req.body)
        res.send({state: true, msg: "Notification sent."});
      } else res.send({state: false, msg: "Device not found."});
    })

  // POST /file
  app.post('/file', upload.single('pdf'), (req, res, next) => {
    const hash = md5File.sync(req.file.path)
    // find duplicates
    var dup = db.get('file').find({ file_hash: hash }).value();
    if (!dup) {
      db.get('file')
      .push({ file_path: req.file.path.substring(6), 
              file_name: req.file.originalname,
              file_hash: hash
            })
      .last()
      .assign({ file_id: Date.now().toString() })
      .write()
      .then(file => res.send(file))
    } else {
      fs.unlinkSync(req.file.path, function(error) {
        if (error) {
            throw error;
        }
        console.log('Deleted ', req.file.path);
      });
      res.send(dup);
    }
  })

  // GET /file
  app.get('/file', (req, res) => {
      const file = db.get('file')
        .find({ file_id: req.query.file_id })
        .value()
      res.send(file)
      })

  // socket.io 
  io.on('connection', (socket) => {
    id = socket.id;
    console.log(socket.id, 'has connected');
    socket.emit('init', 1);
    db.get('device')
      .push({
            uid: 0,
            device_id: socket.id,
            color: random_rgba()
          })
      .write()
    
    socket.on('updateInfo', (info) => {
      db.get('device')
        .find({ device_id: socket.id })
        .assign( info )
        .write()
      const device = db.get('device').find({ device_id: socket.id }).value();
      socket.broadcast.emit('pushDevice', device);
      socket.emit('yourID' ,socket.id);
    });

    socket.on('disconnect', () => {
      console.log(socket.id, 'has disconnected');
      const device = db.get('device').find({ device_id: socket.id }).value();
      socket.broadcast.emit('popDevice', device);
      db.get('device')
        .remove({ device_id: socket.id })
        .write()
    });
  });
})

server.listen(3002, "0.0.0.0", () => console.log('listening on port 3002'));

// ----------------------
function random_rgba() {
  var o = Math.round, r = Math.random, s = 255;
  const hex = (dec) => {
    return ('00' + dec.toString(16).toUpperCase()).slice(-2);
  }
  return '#FF' + hex(o(r()*s)) + hex(o(r()*s)) + hex(o(r()*s));
}