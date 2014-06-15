
'use strict';

var MDgram = require('dgram');

var Config = require('./config');

var Util = require('./util');

var Status = require('./status');

var Mounts = {};

var Slave = new (require('ws'))(Config.MASTER_URI);

Slave.on('open', function() {
	
	Slave.send(Util.Message('register', {
		name: Config.NAME
	}));
	
});

Slave.on('message', function(message) {

	try {

		var json = JSON.parse(message);
		console.log(json.type);
		Slave.emit(json.type, json.data);

	} catch (err) {
		console.error(err);
		console.error(message);
	}

});

Slave.on('mount', function(data) {
	
	var m = Mounts[data.address] = {};
	
	switch (data.type) {
	case 'rawUDPSocket':
	case 'udpSocketProxy':

		// FIXME: 现在failback到了以前的一对一模式，一对多需要修改的地方比较多，对路由器有要求，而且没什么必要，还不如把录像中转做出来呢。

		m.server = null;
		m.client = null;
		//m.tunnels = {};

		m.heartbeat = MDgram.createSocket('udp4');
		m.listen = MDgram.createSocket('udp4');

		m.heartbeat.on('message', function(msg, rinfo) {

			if(msg.length == 1 && msg[0] == 0x00) {

				console.log('heartbeat, receive.');

				if (!m.server || (m.server.address != rinfo.address || m.server.port != rinfo.port)) {
					console.log('heartbeat, overwrite.');
					m.server = {};
					m.server.address = rinfo.address;
					m.server.port = rinfo.port;
				}

				m.heartbeat.send(msg, 0, msg.length, m.server.port, m.server.address);

			}
			else if(m.client) {

					m.listen.send(msg, 0, msg.length, m.client.port, m.client.address);

			}
			else {

				console.log('heartbeat, unknown.');

			}



		});

		m.listen.on('message', function(msg, rinfo) {

			if(!m.client) {

					console.log('listen, overwrite.');
					m.client = {};
					m.client.address = rinfo.address;
					m.client.port = rinfo.port;

			}

			if(m.server) {

				m.heartbeat.send(msg, 0, msg.length, m.server.port, m.server.address);

			}

			/*
			var address = rinfo.address + ':' + rinfo.port;

			if(m.tunnels[address]) {

				m.tunnels[address].send(msg, 0, msg.length, m.server.port, m.server.address);

			}
			else {

				m.tunnels[address] = MDgram.createSocket('udp4');
				m.tunnels[address].on('message', function(_msg, _rinfo) {

					m.listen.send(_msg, 0, _msg.length, rinfo.port, rinfo.address);

				});


				Util.Async(function*(callback) {

					yield m.tunnels[address].bind(0, callback);
					console.log('listen, bind.');
					m.tunnels[address].send(msg, 0, msg.length, m.server.port, m.server.address);

				});

			}
			*/

		});

		Util.Async(function*(callback) {

			yield m.heartbeat.bind(0, callback);
			yield m.listen.bind(0, callback);

			Slave.send(Util.Message('forward', {
				status : Status.SUCCESS,
				address: data.address,
				heartbeatHost : data.slaveHost,
				heartbeatPort : m.heartbeat.address().port,
				listenHost : data.slaveHost,
				listenPort : m.listen.address().port
			}));

			var sendPunch = function() {

				if (!m.server) {

					console.log('punch, server == null, waiting.');
					setTimeout(sendPunch, 1000);

				} else {

					Slave.send(Util.Message('punch', {
						status : Status.SUCCESS,
						address: data.address,
						punchHost : m.server.address,
						punchPort : m.server.port
					}));

				}

			};

			sendPunch();

		});

		break;
	}

});
