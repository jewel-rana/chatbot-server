//Express
const express = require('express');
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io").listen(server); //PORT
const port = process.env.PORT || 4000;
const hostname = "192.168.0.117";
server.listen(port, hostname, () => {
  console.log("Server Running on port " + hostname + ":" + port);
});

//modules
const Joi = require("joi");
const bodyParser = require("body-parser");
const path = require("path");

//configure Express
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname + "/views"));

//middlewares
app.use(express.static("assets", ["js", "css", "png", "jpg", "gif"]));
app.use(express.static("views", ["ejs"]));
app.use(express.static('bower_components', ['js', 'css']));
app.use(bodyParser.urlencoded({
    extended: true
}));

//data storage
const nicknames = [];
const oUsers = [];
const supportManagers = [];
const commonRoom = 'Common Room';

const mysql = require('mysql');

const con = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'chatbot'
});

con.connect(function(err) {
  if (err) {
    console.log('error: ' + err.message);
  }
 
  console.log('Connected to the MySQL server.');
});

//routes
// const webRoutes = require('./routes/web')(app, express);
// app.use('/api', require('./routes/api'));
// app.use(webRoutes);

io.sockets.on('connection', (socket) => {
    // console.log(io.sockets.sockets);

    getGroupMessages((data) => {
        socket.emit('need_info', {socket_id: socket.id}, data);
        io.sockets.in(commonRoom).emit('group_messages', data);
    });

    socket.on('my_info', (info) => {
        socket.user_id = info.user_id;
        socket.nickname = info.username;
        socket.group = info.group;
        socket.join(commonRoom);

        var userHas = false;
        if( nicknames.length > 0 && typeof nicknames !='undefined' ) {
            for( var i = 0; i < nicknames.length; i++ ) {
                if( parseInt( nicknames[i].id ) === parseInt(info.id) ){
                    userHas = true;
                    nicknames[i].socket_id = socket.id;
                }
            }
        }

        if (userHas == true) {
            socket.user_id = info.user_id;
            socket.nickname = info.username;
        } else {
            socket.user_id = info.user_id;
            socket.nickname = info.username;
            nicknames.push({name: socket.nickname, id: info.user_id, socket: socket.id});

            io.sockets.in(commonRoom).emit("user join", {id: socket.user_id, name: socket.nickname});
        }
        console.log(nicknames);

        // io.sockets.in(commonRoom).emit('users', {data:nicknames});
        updateNickNames(socket);
        
    });

    socket.on('send_message', (data) => {
        var message = {user_id: socket.user_id, message: data.msg, receiver_id: parseInt(data.receiver), status:0}
        
        //save to database
        con.query('INSERT INTO chats SET ?', message, (err, rows) => {
            if(err == null ){
                console.log('new message sent 0');
                const resp = {name: socket.nickname, msg: data.msg, id: message.user_id, receiver: message.receiver_id, socket_id: socket.id};
                io.sockets.in('room_' + socket.user_id).emit('chat_message', resp);
                // io.sockets.emit('new_message_' + message.user_id, resp);
                // io.sockets.emit('reply_message_' + message.receiver_id, {name: socket.nickname, msg: data.msg, id: message.user_id, receiver: message.receiver_id, socket_id: socket.id});
            } else {
                console.log('new message sent err' + err);
                socket.emit('bug reporting', err);
            }
        });
        if( message.receiver_id == 0 ) {
            getUnAcceptedList((data) => {
                io.sockets.emit('unaccepted list', data);
            });
        }
    });

    socket.on('group_message', (data) => {
        var message = {user_id: socket.user_id, message: data.msg, receiver_id: 0};
        //save to database
        con.query('INSERT INTO chats SET ?', message, (err, rows) => {
            if(err == null ){
                const resp = {name: socket.nickname, msg: data.msg, id: socket.user_id};
                io.sockets.in(commonRoom).emit('group_message', resp);
            } else {
                socket.emit('bug reporting', err);
            }
        });
    });

    socket.on('personal_message', (data) => {
        var message = {user_id: socket.user_id, message: data.msg, receiver_id: data.receiver}
        console.log(message);
        //save to database
        con.query('INSERT INTO chats SET ?', message, (err, rows) => {
            if(err == null ) {
                console.log('personal message sent');
                const resp = {name: socket.nickname, msg: data.msg, id: message.user_id, receiver: message.receiver_id, socket_id: socket.id};
                io.sockets.emit('pm', resp);
            } else {
                console.log('personal message error - ' + err);
                socket.emit('bug reporting', err);
            }
        });
    });

    socket.on('send_message_' + socket.user_id, (data) => {
        console.log(data);
        var message = {user_id: socket.user_id, message: data.msg, receiver_id: data.receiver}
        //save to database
        con.query('INSERT INTO chats SET ?', message, (err, rows) => {
            if(err == null ) {
                console.log('new message sent');
                io.sockets.emit('new_message_' + data.receiver, {name: socket.nickname, msg: data.msg, id: message.user_id, receiver: message.receiver_id, socket_id: socket.id});
            } else {
                console.log('new message sent err' + err);
                socket.emit('bug reporting', err);
            }
        });
    });

    socket.on('get old messages', (data) => {
        let receiver_id = socket.user_id;
        let sender_id = data.id;

        // console.log('Receiver ID : ' + receiver_id + 'Sender : ' + sender_id);
        con.query(
      "SELECT chats.id, chats.message, chats.sending_at, chats.user_id as sender_id, S.name as sender_name, R.name as receiver_name FROM chats LEFT JOIN users as S ON chats.user_id=S.id LEFT JOIN users R ON chats.receiver_id=R.id WHERE chats.user_id="+ receiver_id +" OR chats.receiver_id="+receiver_id+" ORDER BY chats.id desc LIMIT 8",
      (err, rows) => {
            if( err == null ) {
                let data = rows;
                socket.emit("old messages", data);
            } else {
                socket.emit('bug reporting', err);
            }
        });
    });

    socket.on('responded_to_msg', (data) => {
        console.log(data);
    });

    socket.on('disconnect', (data) => {
        // if (!socket.user_id) return;
        //remove nickname of disconnected user
        // nicknames.delete(nicknames[socket.nickname]);
        // delete nicknames[socket.nickname];
        for( let i = 0; i < nicknames.length; i++ ) {
            if( nicknames[i].id == socket.user_id){
                nicknames.splice(i, 1);
            }
        }

        io.sockets.in(commonRoom).emit('user_left', { name: socket.nickname, id: socket.user_id });
        updateNickNames(socket);
    });
});

function updateNickNames(socket) {
    const oUsers = [];
    for( var i = 0; i < nicknames.length; i++ ) {
        oUsers.push( {name: nicknames[i].name, socket_id: nicknames[i].socket, user_id: nicknames[i].id } );
    }
    // console.log(oUsers);
    io.sockets.emit('users', oUsers);
}

function getUnAcceptedList(callback) {
    con.query(
      "SELECT chats.id, chats.message, chats.sending_at, chats.user_id as sender_id, S.name as sender_name FROM chats LEFT JOIN users as S ON chats.user_id=S.id WHERE chats.receiver_id='0' GROUP BY chats.user_id LIMIT 10",
      (err, rows) => {
            if( err == null ) {
                let data = rows;
                console.log(data);
                // socket.emit('unaccepted list', data);
                callback(data);
            } else {
                // socket.emit('bug reporting', err);
            }
        });
}

function getGroupMessages(callback) {
    con.query(
      "SELECT chats.id, chats.message, chats.sending_at, chats.user_id as sender_id, S.name as sender_name FROM chats LEFT JOIN users as S ON chats.user_id=S.id WHERE chats.type='g' ORDER BY id DESC LIMIT 20",
      (err, rows) => {
            if( err == null ) {
                let data = rows;
                callback(data);
            } else {
                socket.emit('bug reporting', err);
            }
        });
}

function validate(data) {
    const schema = {
        name: Joi.string()
            .min(6)
            .required()
    };
    const result = Joi.validate(data, schema);
    // console.log(result);
    if (result.error)
        return result.error.details[0].message;
}

function getSocket( userId ) {

    return io.sockets.sockets[userId];
    // scht.broadcust.to(sock.socket.id).emit('agent_join', msg);
}

// function userExist( user_id ){ //q, VARIABLE FROM THE INPUT FIELD
//   var k = false;

//    //LOOPS THRU THE ARRAY TO CHECK IF THE KEY EXISTS
//   for(i=0; i<nicknames.length; i++){
//     if(q==nick[i]){
//       k = "true";
//     }
//   }
//   $("#k").html(k); //SHOWS EITHER "TRUE" OF "FALSE"
// }
